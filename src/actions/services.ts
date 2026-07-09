'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  CreateServiceSchema,
  UpdateServiceSchema,
  ToggleServiceActiveSchema,
} from '@/types/schemas'
import type {
  CreateServiceInput,
  UpdateServiceInput,
  ToggleServiceActiveInput,
} from '@/types/schemas'
import type { ActionResult } from '@/types/index'

export async function createService(data: CreateServiceInput): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = CreateServiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: 'profile_not_found' }

  await db.service.create({
    data: { ...parsed.data, providerId: profile.id },
  })
  return { success: true, data: null }
}

// Devuelve 'service_not_found' también cuando el servicio es de otro proveedor,
// para no revelar la existencia de servicios ajenos.
async function ownsService(serviceId: string, userId: string): Promise<boolean> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: { provider: { select: { userId: true } } },
  })
  return service?.provider.userId === userId
}

export async function updateService(data: UpdateServiceInput): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = UpdateServiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  if (!(await ownsService(parsed.data.id, session.user.id))) {
    return { success: false, error: 'service_not_found' }
  }

  const { id, ...fields } = parsed.data
  await db.service.update({ where: { id }, data: fields })
  return { success: true, data: null }
}

export async function toggleServiceActive(
  data: ToggleServiceActiveInput,
): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = ToggleServiceActiveSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  if (!(await ownsService(parsed.data.id, session.user.id))) {
    return { success: false, error: 'service_not_found' }
  }

  await db.service.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  })
  return { success: true, data: null }
}
