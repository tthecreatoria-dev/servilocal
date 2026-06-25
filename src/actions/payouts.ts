'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { UpdatePayoutSettingsSchema, MarkPayoutPaidSchema } from '@/types/schemas'
import type { UpdatePayoutSettingsInput, MarkPayoutPaidInput } from '@/types/schemas'
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

export async function markPayoutPaid(
  data: MarkPayoutPaidInput,
): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'ADMIN') return { success: false, error: 'forbidden' }

  const parsed = MarkPayoutPaidSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    await db.$transaction(async (tx) => {
      const payment = await tx.jobPayment.findUnique({
        where: { id: parsed.data.jobPaymentId },
        include: {
          commission: true,
          jobPost: {
            include: {
              applications: { where: { status: 'ACCEPTED' }, select: { providerId: true } },
            },
          },
        },
      })
      if (!payment) throw new Error('payment_not_found')
      if (payment.status !== 'PENDING_PAYOUT') throw new Error('payment_not_pending_payout')

      const providerId = payment.jobPost.applications[0]?.providerId
      if (!providerId) throw new Error('provider_not_found')

      const profile = await tx.providerProfile.findUnique({ where: { userId: providerId } })
      const destination =
        profile?.payoutMethod === 'PAYPAL' ? profile.paypalEmail
        : profile?.payoutMethod === 'TKIERO' ? profile.tkieroAccount
        : null
      if (!profile?.payoutMethod || !destination) throw new Error('payout_destination_missing')

      // Invariant: funds never move without a recorded commission.
      if (!payment.commission) throw new Error('commission_missing')

      const net = Number(payment.amount) - Number(payment.commission.amount)
      await tx.payout.create({
        data: {
          jobPaymentId: payment.id,
          providerId,
          amount: net,
          method: profile.payoutMethod,
          destination,
          reference: parsed.data.reference ?? null,
          paidById: session.user.id,
        },
      })
      await tx.jobPayment.update({
        where: { id: payment.id },
        data: { status: 'RELEASED' },
      })
    })
    return { success: true, data: null }
  } catch (error) {
    if (error instanceof Error) {
      const known = [
        'payment_not_found', 'payment_not_pending_payout', 'provider_not_found',
        'payout_destination_missing', 'commission_missing',
      ]
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
