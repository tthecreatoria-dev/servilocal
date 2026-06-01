// src/lib/__tests__/commission.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateCommission, COMMISSION_RATES, recordCommission } from '@/lib/commission'
import type { ServiceCategory } from '@/types'

describe('COMMISSION_RATES', () => {
  it('has rates for all 6 categories', () => {
    const categories: ServiceCategory[] = [
      'DELIVERY', 'PLUMBING', 'CLEANING', 'TEACHING', 'DESIGN', 'DIGITAL',
    ]
    for (const category of categories) {
      expect(COMMISSION_RATES[category]).toBeTypeOf('number')
    }
  })

  it('has correct rates per category', () => {
    expect(COMMISSION_RATES.DELIVERY).toBe(0.15)
    expect(COMMISSION_RATES.PLUMBING).toBe(0.12)
    expect(COMMISSION_RATES.CLEANING).toBe(0.12)
    expect(COMMISSION_RATES.TEACHING).toBe(0.10)
    expect(COMMISSION_RATES.DESIGN).toBe(0.10)
    expect(COMMISSION_RATES.DIGITAL).toBe(0.08)
  })
})

describe('calculateCommission', () => {
  it('calculates 15% for DELIVERY', () => {
    const result = calculateCommission(100, 'DELIVERY')
    expect(result.commissionAmount).toBe(15)
    expect(result.rate).toBe(0.15)
    expect(result.providerAmount).toBe(85)
  })

  it('calculates 8% for DIGITAL', () => {
    const result = calculateCommission(100, 'DIGITAL')
    expect(result.commissionAmount).toBe(8)
    expect(result.rate).toBe(0.08)
    expect(result.providerAmount).toBe(92)
  })

  it('rounds commission to 2 decimal places', () => {
    // 33.33 * 0.15 = 4.9995 → rounds to 5.00
    const result = calculateCommission(33.33, 'DELIVERY')
    expect(result.commissionAmount).toBe(5.00)
    expect(result.providerAmount).toBe(28.33)
  })

  it('provider amount is amount minus commission (no double rounding loss)', () => {
    const result = calculateCommission(99.99, 'DESIGN')
    // 99.99 * 0.10 = 9.999 → 10.00
    expect(result.commissionAmount).toBe(10.00)
    expect(result.providerAmount).toBe(89.99)
  })

  it('calculates 12% for PLUMBING', () => {
    const result = calculateCommission(100, 'PLUMBING')
    expect(result.commissionAmount).toBe(12)
    expect(result.rate).toBe(0.12)
    expect(result.providerAmount).toBe(88)
  })

  it('throws for unknown category', () => {
    expect(() =>
      calculateCommission(100, 'UNKNOWN' as ServiceCategory)
    ).toThrow('Unknown service category: UNKNOWN')
  })
})

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    commission: {
      create: mockCreate,
    },
  },
}))

describe('recordCommission', () => {
  beforeEach(() => {
    mockCreate.mockClear()
  })

  it('calls db.commission.create with the correct payload', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'comm_1', amount: 15, rate: 0.15 })

    await recordCommission('txn_1', 100, 'DELIVERY')

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        transactionId: 'txn_1',
        amount: 15,
        rate: 0.15,
        category: 'DELIVERY',
      },
    })
  })

  it('records the calculated commission amount (not the raw amount)', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'comm_2', amount: 8, rate: 0.08 })

    await recordCommission('txn_2', 100, 'DIGITAL')

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 8, rate: 0.08 }),
    })
  })

  it('propagates db errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB connection failed'))

    await expect(recordCommission('txn_3', 100, 'DELIVERY')).rejects.toThrow(
      'DB connection failed',
    )
  })
})
