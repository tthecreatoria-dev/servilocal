// src/lib/commission.ts
import type { ServiceCategory, CommissionResult } from '@/types'

export const COMMISSION_RATES: Record<ServiceCategory, number> = {
  DELIVERY: 0.15,
  PLUMBING: 0.12,
  CLEANING: 0.12,
  TEACHING: 0.10,
  DESIGN: 0.10,
  DIGITAL: 0.08,
}

export function calculateCommission(
  amount: number,
  category: ServiceCategory,
): CommissionResult {
  const rate = COMMISSION_RATES[category]
  if (rate === undefined) {
    throw new Error(`Unknown service category: ${category}`)
  }
  const commissionAmount = parseFloat((amount * rate).toFixed(2))
  const providerAmount = parseFloat((amount - commissionAmount).toFixed(2))
  return { commissionAmount, rate, providerAmount }
}

export async function recordCommission(
  transactionId: string,
  amount: number,
  category: ServiceCategory,
) {
  const { commissionAmount, rate } = calculateCommission(amount, category)
  // Lazy import to avoid instantiating the DB client at module load time
  const { db } = await import('@/lib/db')

  return db.commission.create({
    data: {
      transactionId,
      amount: commissionAmount,
      rate,
      category,
    },
  })
}
