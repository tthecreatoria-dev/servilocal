'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { UpdatePayoutSettingsSchema } from '@/types/schemas'
import type { UpdatePayoutSettingsInput } from '@/types/schemas'
import type { ActionResult } from '@/types/index'

export async function updatePayoutSettings(
  data: UpdatePayoutSettingsInput,
): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = UpdatePayoutSettingsSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: 'profile_not_found' }

  await db.providerProfile.update({
    where: { userId: session.user.id },
    data:
      parsed.data.payoutMethod === 'PAYPAL'
        ? { payoutMethod: 'PAYPAL', paypalEmail: parsed.data.paypalEmail, tkieroAccount: null }
        : { payoutMethod: 'TKIERO', tkieroAccount: parsed.data.tkieroAccount, paypalEmail: null },
  })

  return { success: true, data: null }
}
