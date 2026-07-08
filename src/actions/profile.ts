'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { UpdateProfileSchema } from '@/types/schemas'
import type { UpdateProfileInput } from '@/types/schemas'
import type { ActionResult } from '@/types/index'

export async function updateProfile(data: UpdateProfileInput): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }

  const parsed = UpdateProfileSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const userUpdate = db.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, phone: parsed.data.phone },
  })

  if (session.user.role !== 'PROVIDER') {
    await userUpdate
    return { success: true, data: null }
  }

  const isRemote = parsed.data.isRemote ?? false
  await db.$transaction([
    userUpdate,
    db.providerProfile.update({
      where: { userId: session.user.id },
      data: {
        bio: parsed.data.bio ?? '',
        skills: parsed.data.skills ?? [],
        showPhone: parsed.data.showPhone ?? false,
        isRemote,
        address: isRemote ? null : parsed.data.address ?? null,
        latitude: isRemote ? null : parsed.data.latitude ?? null,
        longitude: isRemote ? null : parsed.data.longitude ?? null,
      },
    }),
  ])
  return { success: true, data: null }
}
