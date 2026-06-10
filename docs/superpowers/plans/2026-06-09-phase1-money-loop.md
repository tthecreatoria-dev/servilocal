# Phase 1 — Money Loop + Provider Payout Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the escrow money loop — providers start/finish jobs, commission is recorded atomically at completion, and the admin liquidates withheld funds to provider-configured payout destinations (PayPal email or Tkiero account).

**Architecture:** New `PENDING_PAYOUT` payment state between `HELD` and `RELEASED`. Job completion records the commission and advances the payment in one Prisma `$transaction` (commission-before-release invariant holds atomically). Payouts are manual-with-registry: an ADMIN-only page lists liquidatable payments; marking one paid creates an auditable `Payout` row. Providers configure their destination on a full profile page; payments with no destination stay visible but blocked.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL, NextAuth v5, Zod, Vitest (mocked-db action tests per `src/actions/__tests__/jobs.test.ts` pattern).

**Spec:** `docs/superpowers/specs/2026-06-09-phase1-money-loop-design.md`

**Conventions that apply to every task:** TypeScript strict (no `any`), named exports only, Zod on every input, typed `ActionResult` errors, `$transaction` for multi-table writes, commission rates only from `src/lib/commission.ts`.

---

### Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>_money_loop_payouts/migration.sql` (via prisma)
- Modify: `src/types/index.ts`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add `PENDING_PAYOUT` to `JobPaymentStatus` (order matters for readability, not for Postgres):

```prisma
enum JobPaymentStatus {
  PENDING
  HELD
  PENDING_PAYOUT
  RELEASED
  REFUNDED
}
```

Add a new enum next to the other enums:

```prisma
enum PayoutMethod {
  PAYPAL
  TKIERO
}
```

Add three fields to `model ProviderProfile` (after `longitude`):

```prisma
  payoutMethod  PayoutMethod?
  paypalEmail   String?
  tkieroAccount String?
```

Replace `model Commission` with (transactionId becomes optional, jobPaymentId added):

```prisma
model Commission {
  id            String          @id @default(cuid())
  transactionId String?         @unique
  jobPaymentId  String?         @unique
  amount        Decimal         @db.Decimal(18, 8)
  rate          Decimal         @db.Decimal(5, 4)
  category      ServiceCategory
  createdAt     DateTime        @default(now())
  transaction   Transaction?    @relation(fields: [transactionId], references: [id], onDelete: Restrict)
  jobPayment    JobPayment?     @relation(fields: [jobPaymentId], references: [id], onDelete: Restrict)
}
```

Add back-relations to `model JobPayment`:

```prisma
  commission      Commission?
  payout          Payout?
```

Add the new `Payout` model:

```prisma
model Payout {
  id           String       @id @default(cuid())
  jobPaymentId String       @unique
  providerId   String
  amount       Decimal      @db.Decimal(10, 2)
  method       PayoutMethod
  destination  String
  reference    String?
  paidById     String
  createdAt    DateTime     @default(now())
  jobPayment   JobPayment   @relation(fields: [jobPaymentId], references: [id], onDelete: Restrict)
  provider     User         @relation("ProviderPayouts", fields: [providerId], references: [id])
  paidBy       User         @relation("AdminPayouts", fields: [paidById], references: [id])

  @@index([providerId])
}
```

Add back-relations to `model User`:

```prisma
  payouts     Payout[] @relation("ProviderPayouts")
  paidPayouts Payout[] @relation("AdminPayouts")
```

- [ ] **Step 2: Create the migration without applying it**

Run: `npx prisma migrate dev --name money_loop_payouts --create-only`
Expected: a new folder under `prisma/migrations/` with `migration.sql`.

- [ ] **Step 3: Append the exactly-one-parent CHECK constraint**

At the end of the generated `migration.sql` add:

```sql
-- A commission belongs to exactly one of: a marketplace Transaction or a JobPayment.
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_exactly_one_parent"
CHECK ((("transactionId" IS NOT NULL)::int + ("jobPaymentId" IS NOT NULL)::int) = 1);
```

- [ ] **Step 4: Apply and regenerate**

Run: `npx prisma migrate dev`
Expected: "Your database is now in sync with your schema." and a regenerated client in `src/generated/prisma/`.

- [ ] **Step 5: Add the `PayoutMethod` TS type**

In `src/types/index.ts`, after `JobApplicationStatus`:

```ts
export type PayoutMethod = 'PAYPAL' | 'TKIERO'
```

- [ ] **Step 6: Verify the whole project still typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/types/index.ts src/generated
git commit -m "feat(db): payout destination fields, PENDING_PAYOUT state, Payout model, Commission↔JobPayment link"
```

---

### Task 2: Zod schemas for the new inputs

**Files:**
- Modify: `src/types/schemas.ts`
- Test: `src/types/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/types/__tests__/schemas.test.ts`:

```ts
import {
  UpdatePayoutSettingsSchema,
  UpdateProfileSchema,
  StartJobSchema,
  MarkPayoutPaidSchema,
} from '@/types/schemas'

describe('UpdatePayoutSettingsSchema', () => {
  it('accepts PAYPAL with a valid email', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'PAYPAL',
      paypalEmail: 'pedro@example.com',
    })
    expect(r.success).toBe(true)
  })

  it('rejects PAYPAL with an invalid email', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'PAYPAL',
      paypalEmail: 'not-an-email',
    })
    expect(r.success).toBe(false)
  })

  it('accepts TKIERO with an account id', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'TKIERO',
      tkieroAccount: '@pedro-sv',
    })
    expect(r.success).toBe(true)
  })

  it('rejects TKIERO with a blank account', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'TKIERO',
      tkieroAccount: '  ',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an unknown method', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'ZELLE',
      paypalEmail: 'x@y.com',
    })
    expect(r.success).toBe(false)
  })
})

describe('UpdateProfileSchema', () => {
  it('accepts minimal client data', () => {
    const r = UpdateProfileSchema.safeParse({ name: 'Ana López', phone: '+50379000000' })
    expect(r.success).toBe(true)
  })

  it('accepts provider fields', () => {
    const r = UpdateProfileSchema.safeParse({
      name: 'Pedro',
      phone: '+50379000001',
      bio: 'Fontanero con 10 años de experiencia',
      skills: ['PLUMBING', 'ELECTRICAL'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.7,
      longitude: -89.24,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a too-short name', () => {
    expect(UpdateProfileSchema.safeParse({ name: 'A', phone: '+50379000000' }).success).toBe(false)
  })

  it('rejects an unknown skill', () => {
    const r = UpdateProfileSchema.safeParse({
      name: 'Pedro', phone: '+50379000001', skills: ['HACKING'],
    })
    expect(r.success).toBe(false)
  })
})

describe('StartJobSchema / MarkPayoutPaidSchema', () => {
  it('accepts a cuid jobPostId', () => {
    expect(StartJobSchema.safeParse({ jobPostId: 'cjld2cjxh0000qzrmn831i7rn' }).success).toBe(true)
  })

  it('rejects a non-cuid id', () => {
    expect(StartJobSchema.safeParse({ jobPostId: '123' }).success).toBe(false)
  })

  it('accepts payout id with optional reference', () => {
    expect(MarkPayoutPaidSchema.safeParse({
      jobPaymentId: 'cjld2cjxh0000qzrmn831i7rn', reference: 'PAYPAL-TX-1',
    }).success).toBe(true)
    expect(MarkPayoutPaidSchema.safeParse({
      jobPaymentId: 'cjld2cjxh0000qzrmn831i7rn',
    }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: FAIL — the new schemas are not exported.

- [ ] **Step 3: Implement the schemas**

In `src/types/schemas.ts`, after `SelectJobApplicationSchema`:

```ts
export const StartJobSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
})

export const CompleteJobSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
})

export const MarkPayoutPaidSchema = z.object({
  jobPaymentId: z.string().cuid('Invalid job payment ID'),
  reference: z.string().max(100, 'Reference must be at most 100 characters').optional(),
})

export const UpdatePayoutSettingsSchema = z.discriminatedUnion('payoutMethod', [
  z.object({
    payoutMethod: z.literal('PAYPAL'),
    paypalEmail: z.string().email('Email de PayPal inválido'),
  }),
  z.object({
    payoutMethod: z.literal('TKIERO'),
    tkieroAccount: z.string().trim().min(3, 'Cuenta Tkiero inválida'),
  }),
])

export const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(7, 'Número de teléfono inválido'),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
  skills: z.array(z.enum(SERVICE_CATEGORY_VALUES)).optional(),
  isRemote: z.boolean().optional(),
  address: z.string().min(5, 'Address must be at least 5 characters').max(200, 'Address must be at most 200 characters').optional(),
  latitude: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude').optional(),
  longitude: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude').optional(),
})
```

And at the bottom, with the other inferred types:

```ts
export type StartJobInput = z.infer<typeof StartJobSchema>
export type CompleteJobInput = z.infer<typeof CompleteJobSchema>
export type MarkPayoutPaidInput = z.infer<typeof MarkPayoutPaidSchema>
export type UpdatePayoutSettingsInput = z.infer<typeof UpdatePayoutSettingsSchema>
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/types/__tests__/schemas.test.ts
git commit -m "feat(schemas): payout settings, profile, job transition, payout-paid inputs"
```

---

### Task 3: `recordJobCommission` in lib/commission.ts

**Files:**
- Modify: `src/lib/commission.ts`
- Test: `src/lib/__tests__/commission.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/commission.test.ts`:

```ts
import { recordJobCommission } from '@/lib/commission'

describe('recordJobCommission()', () => {
  it('creates a commission row linked to the job payment with the category rate', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'comm_1' })
    const tx = { commission: { create } }
    await recordJobCommission(tx, 'payment_1', 100, 'PLUMBING')
    expect(create).toHaveBeenCalledWith({
      data: {
        jobPaymentId: 'payment_1',
        amount: 12,
        rate: 0.12,
        category: 'PLUMBING',
      },
    })
  })

  it('propagates a create failure (caller must abort the release)', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'))
    const tx = { commission: { create } }
    await expect(recordJobCommission(tx, 'payment_1', 100, 'PLUMBING')).rejects.toThrow('db down')
  })
})
```

(Ensure `vi` is in the existing vitest import at the top of the file.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/commission.test.ts`
Expected: FAIL — `recordJobCommission` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/commission.ts`:

```ts
// Minimal structural type so the function works with both the real Prisma
// transaction client and test doubles.
type CommissionWriter = {
  commission: {
    create: (args: {
      data: { jobPaymentId: string; amount: number; rate: number; category: ServiceCategory }
    }) => Promise<unknown>
  }
}

/**
 * Records the commission for a job payment INSIDE the caller's transaction.
 * Must be called before the payment advances past HELD — if this throws, the
 * caller's $transaction rolls back and no funds move.
 */
export async function recordJobCommission(
  tx: CommissionWriter,
  jobPaymentId: string,
  amount: number,
  category: ServiceCategory,
) {
  const { commissionAmount, rate } = calculateCommission(amount, category)
  return tx.commission.create({
    data: { jobPaymentId, amount: commissionAmount, rate, category },
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/__tests__/commission.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commission.ts src/lib/__tests__/commission.test.ts
git commit -m "feat(commission): recordJobCommission for job payments inside caller transaction"
```

---

### Task 4: `startJob` action

**Files:**
- Modify: `src/actions/jobs.ts`
- Test: `src/actions/__tests__/jobs.test.ts`

The test file already mocks `@/lib/auth` and `@/lib/db` with `vi.hoisted` mocks. Extend the db mock with `jobApplication.findFirst` if absent, and reuse `mockTransaction`.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/__tests__/jobs.test.ts` (inside the file, after the existing describes; add `startJob` to the existing import from `@/actions/jobs`):

```ts
describe('startJob()', () => {
  const PROVIDER_SESSION = { user: { id: 'prov_1', role: 'PROVIDER' } }
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-provider roles', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } })
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid ids', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    expect(await startJob({ jobPostId: 'nope' })).toEqual({ success: false, error: 'validation' })
  })

  it('rejects when the post is not ASSIGNED', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({ id: JOB_ID, status: 'OPEN', applications: [] }),
        update: vi.fn(),
      },
    }))
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_assigned' })
  })

  it('rejects a provider who is not the accepted applicant', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, status: 'ASSIGNED',
          applications: [{ providerId: 'someone_else' }],
        }),
        update: vi.fn(),
      },
    }))
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'not_assigned_provider' })
  })

  it('moves ASSIGNED → IN_PROGRESS for the accepted provider', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    const update = vi.fn().mockResolvedValue({ id: JOB_ID, status: 'IN_PROGRESS' })
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, status: 'ASSIGNED',
          applications: [{ providerId: 'prov_1' }],
        }),
        update,
      },
    }))
    const result = await startJob({ jobPostId: JOB_ID })
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ where: { id: JOB_ID }, data: { status: 'IN_PROGRESS' } })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — `startJob` is not exported.

- [ ] **Step 3: Implement `startJob`**

In `src/actions/jobs.ts`, add `StartJobSchema` and `StartJobInput` to the existing imports from `@/types/schemas`, then append:

```ts
export async function startJob(
  data: StartJobInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.update>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = StartJobSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    const updated = await db.$transaction(async (tx) => {
      const post = await tx.jobPost.findUnique({
        where: { id: parsed.data.jobPostId },
        include: { applications: { where: { status: 'ACCEPTED' }, select: { providerId: true } } },
      })
      if (!post) throw new Error('post_not_found')
      if (post.status !== 'ASSIGNED') throw new Error('post_not_assigned')
      const accepted = post.applications[0]
      if (!accepted || accepted.providerId !== session.user.id) {
        throw new Error('not_assigned_provider')
      }
      return tx.jobPost.update({
        where: { id: post.id },
        data: { status: 'IN_PROGRESS' },
      })
    })
    return { success: true, data: updated }
  } catch (error) {
    if (error instanceof Error) {
      const known = ['post_not_found', 'post_not_assigned', 'not_assigned_provider']
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): startJob action — accepted provider moves ASSIGNED → IN_PROGRESS"
```

---

### Task 5: `completeJob` action (commission-before-release, atomic)

**Files:**
- Modify: `src/actions/jobs.ts`
- Test: `src/actions/__tests__/jobs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/__tests__/jobs.test.ts` (add `completeJob` to the import). Note the commission assertion goes through the REAL `recordJobCommission` (not mocked), so the created data is checked end to end:

```ts
describe('completeJob()', () => {
  const CLIENT_SESSION = { user: { id: 'client_1', role: 'CLIENT' } }
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(overrides: Record<string, unknown> = {}) {
    return {
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, clientId: 'client_1', status: 'IN_PROGRESS', category: 'PLUMBING',
          payment: { id: 'pay_1', status: 'HELD', amount: 100 },
        }),
        update: vi.fn().mockResolvedValue({ id: JOB_ID, status: 'COMPLETED' }),
      },
      jobPayment: { update: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING_PAYOUT' }) },
      commission: { create: vi.fn().mockResolvedValue({ id: 'comm_1' }) },
      ...overrides,
    }
  }

  it('rejects a non-owner client', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'other', role: 'CLIENT' } })
    mockTransaction.mockImplementation(async (fn) => fn(makeTx()))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_owned' })
  })

  it('rejects when the post is not IN_PROGRESS', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    tx.jobPost.findUnique = vi.fn().mockResolvedValue({
      id: JOB_ID, clientId: 'client_1', status: 'ASSIGNED', category: 'PLUMBING',
      payment: { id: 'pay_1', status: 'HELD', amount: 100 },
    })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_in_progress' })
  })

  it('rejects when the payment is not HELD (no backwards transitions)', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    tx.jobPost.findUnique = vi.fn().mockResolvedValue({
      id: JOB_ID, clientId: 'client_1', status: 'IN_PROGRESS', category: 'PLUMBING',
      payment: { id: 'pay_1', status: 'RELEASED', amount: 100 },
    })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'payment_not_held' })
  })

  it('records the commission and advances payment + post atomically', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    const result = await completeJob({ jobPostId: JOB_ID })
    expect(result.success).toBe(true)
    expect(tx.commission.create).toHaveBeenCalledWith({
      data: { jobPaymentId: 'pay_1', amount: 12, rate: 0.12, category: 'PLUMBING' },
    })
    expect(tx.jobPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay_1' }, data: { status: 'PENDING_PAYOUT' },
    })
    expect(tx.jobPost.update).toHaveBeenCalledWith({
      where: { id: JOB_ID }, data: { status: 'COMPLETED' },
    })
  })

  it('aborts everything when commission recording fails', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx({ commission: { create: vi.fn().mockRejectedValue(new Error('db down')) } })
    // emulate Prisma: a throw inside the callback rejects the whole transaction
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    await expect(completeJob({ jobPostId: JOB_ID })).rejects.toThrow('db down')
    expect(tx.jobPayment.update).not.toHaveBeenCalled()
    expect(tx.jobPost.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — `completeJob` is not exported.

- [ ] **Step 3: Implement `completeJob`**

In `src/actions/jobs.ts`, add `CompleteJobSchema`/`CompleteJobInput` to the schema imports and `import { recordJobCommission } from '@/lib/commission'`, then append:

```ts
export async function completeJob(
  data: CompleteJobInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.update>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'CLIENT') return { success: false, error: 'forbidden' }

  const parsed = CompleteJobSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    const updated = await db.$transaction(async (tx) => {
      const post = await tx.jobPost.findUnique({
        where: { id: parsed.data.jobPostId },
        include: { payment: true },
      })
      if (!post) throw new Error('post_not_found')
      if (post.clientId !== session.user.id) throw new Error('post_not_owned')
      if (post.status !== 'IN_PROGRESS') throw new Error('post_not_in_progress')
      if (!post.payment) throw new Error('payment_not_found')
      if (post.payment.status !== 'HELD') throw new Error('payment_not_held')

      // Business rule: commission is recorded BEFORE the payment advances.
      // A failure here rolls back the entire transaction — no funds move.
      await recordJobCommission(tx, post.payment.id, Number(post.payment.amount), post.category)
      await tx.jobPayment.update({
        where: { id: post.payment.id },
        data: { status: 'PENDING_PAYOUT' },
      })
      return tx.jobPost.update({
        where: { id: post.id },
        data: { status: 'COMPLETED' },
      })
    })
    return { success: true, data: updated }
  } catch (error) {
    if (error instanceof Error) {
      const known = [
        'post_not_found', 'post_not_owned', 'post_not_in_progress',
        'payment_not_found', 'payment_not_held',
      ]
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): completeJob — atomic commission recording + HELD → PENDING_PAYOUT"
```

---

### Task 6: profile + payout-settings actions

**Files:**
- Create: `src/actions/profile.ts`
- Create: `src/actions/payouts.ts` (updatePayoutSettings only; markPayoutPaid arrives in Task 7)
- Test: `src/actions/__tests__/profile.test.ts`
- Test: `src/actions/__tests__/payouts.test.ts`

- [ ] **Step 1: Write the failing tests for `updatePayoutSettings`**

Create `src/actions/__tests__/payouts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockProfileFindUnique = vi.hoisted(() => vi.fn())
const mockProfileUpdate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockJobPaymentFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    providerProfile: { findUnique: mockProfileFindUnique, update: mockProfileUpdate },
    jobPayment: { findUnique: mockJobPaymentFindUnique },
    $transaction: mockTransaction,
  },
}))

import { updatePayoutSettings } from '@/actions/payouts'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updatePayoutSettings()', () => {
  const PROVIDER_SESSION = { user: { id: 'prov_1', role: 'PROVIDER' } }

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'a@b.com' }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-providers', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } })
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'a@b.com' }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'nope' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('saves a PayPal destination and clears the Tkiero one', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue({ id: 'pp_1', userId: 'prov_1' })
    mockProfileUpdate.mockResolvedValue({})
    const result = await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com' })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: { payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com', tkieroAccount: null },
    })
  })

  it('saves a Tkiero destination and clears the PayPal one', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue({ id: 'pp_1', userId: 'prov_1' })
    mockProfileUpdate.mockResolvedValue({})
    const result = await updatePayoutSettings({ payoutMethod: 'TKIERO', tkieroAccount: '@pedro' })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: { payoutMethod: 'TKIERO', tkieroAccount: '@pedro', paypalEmail: null },
    })
  })

  it('errors when the provider profile does not exist', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await updatePayoutSettings({ payoutMethod: 'TKIERO', tkieroAccount: '@pedro' }))
      .toEqual({ success: false, error: 'profile_not_found' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/actions/__tests__/payouts.test.ts`
Expected: FAIL — module `@/actions/payouts` does not exist.

- [ ] **Step 3: Implement `src/actions/payouts.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/actions/__tests__/payouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `updateProfile`**

Create `src/actions/__tests__/profile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockUserUpdate = vi.hoisted(() => vi.fn())
const mockProfileUpdate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { update: mockUserUpdate },
    providerProfile: { update: mockProfileUpdate },
    $transaction: mockTransaction,
  },
}))

import { updateProfile } from '@/actions/profile'

beforeEach(() => {
  vi.clearAllMocks()
  // db.$transaction receives an array of promises here (sequential writes pattern)
  mockTransaction.mockImplementation(async (ops) => Promise.all(ops))
})

describe('updateProfile()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updateProfile({ name: 'Ana López', phone: '+50379000000' }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await updateProfile({ name: 'A', phone: '+50379000000' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('updates only user fields for a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({ name: 'Ana López', phone: '+50379000000' })
    expect(result.success).toBe(true)
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Ana López', phone: '+50379000000' },
    })
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })

  it('updates user + provider profile for a PROVIDER in one transaction', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    mockProfileUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({
      name: 'Pedro', phone: '+50379000001', bio: 'Fontanero', skills: ['PLUMBING'],
      isRemote: false, address: 'Col. Escalón, San Salvador', latitude: 13.7, longitude: -89.24,
    })
    expect(result.success).toBe(true)
    expect(mockTransaction).toHaveBeenCalled()
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: {
        bio: 'Fontanero', skills: ['PLUMBING'], isRemote: false,
        address: 'Col. Escalón, San Salvador', latitude: 13.7, longitude: -89.24,
      },
    })
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/actions/__tests__/profile.test.ts`
Expected: FAIL — module `@/actions/profile` does not exist.

- [ ] **Step 7: Implement `src/actions/profile.ts`**

```ts
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
        isRemote,
        address: isRemote ? null : parsed.data.address ?? null,
        latitude: isRemote ? null : parsed.data.latitude ?? null,
        longitude: isRemote ? null : parsed.data.longitude ?? null,
      },
    }),
  ])
  return { success: true, data: null }
}
```

Note: the provider test passes `isRemote: false` with full location, so the asserted `data` matches. If the assertion fails on `bio`/`skills` defaults, the test data is explicit — fix the implementation, not the test.

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run src/actions/__tests__/profile.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/actions/profile.ts src/actions/payouts.ts src/actions/__tests__/profile.test.ts src/actions/__tests__/payouts.test.ts
git commit -m "feat(actions): updateProfile and updatePayoutSettings"
```

---

### Task 7: `markPayoutPaid` action (ADMIN)

**Files:**
- Modify: `src/actions/payouts.ts`
- Test: `src/actions/__tests__/payouts.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/__tests__/payouts.test.ts` (add `markPayoutPaid` to the import):

```ts
describe('markPayoutPaid()', () => {
  const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN' } }
  const PAY_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(paymentOverrides: Record<string, unknown> = {}, profile: unknown = {
    payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com', tkieroAccount: null,
  }) {
    return {
      jobPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: PAY_ID, status: 'PENDING_PAYOUT', amount: 100,
          commission: { id: 'comm_1', amount: 12 },
          jobPost: { applications: [{ providerId: 'prov_1' }] },
          ...paymentOverrides,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      providerProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      payout: { create: vi.fn().mockResolvedValue({ id: 'payout_1' }) },
    }
  }

  it('rejects non-admin callers', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects payments that are not PENDING_PAYOUT', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({ status: 'RELEASED' })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'payment_not_pending_payout' })
  })

  it('rejects when the provider has no payout destination', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({}, { payoutMethod: null, paypalEmail: null, tkieroAccount: null })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'payout_destination_missing' })
    expect(tx.payout.create).not.toHaveBeenCalled()
    expect(tx.jobPayment.update).not.toHaveBeenCalled()
  })

  it('rejects when no commission exists (never release without commission)', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({ commission: null })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'commission_missing' })
  })

  it('creates an audit Payout with the net amount and releases the payment', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx()
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    const result = await markPayoutPaid({ jobPaymentId: PAY_ID, reference: 'PP-TX-9' })
    expect(result.success).toBe(true)
    expect(tx.payout.create).toHaveBeenCalledWith({
      data: {
        jobPaymentId: PAY_ID,
        providerId: 'prov_1',
        amount: 88,
        method: 'PAYPAL',
        destination: 'pedro@mail.com',
        reference: 'PP-TX-9',
        paidById: 'admin_1',
      },
    })
    expect(tx.jobPayment.update).toHaveBeenCalledWith({
      where: { id: PAY_ID }, data: { status: 'RELEASED' },
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/actions/__tests__/payouts.test.ts`
Expected: FAIL — `markPayoutPaid` is not exported.

- [ ] **Step 3: Implement `markPayoutPaid`**

Append to `src/actions/payouts.ts` (add `MarkPayoutPaidSchema`/`MarkPayoutPaidInput` to imports):

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/actions/__tests__/payouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the FULL suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/actions/payouts.ts src/actions/__tests__/payouts.test.ts
git commit -m "feat(payouts): markPayoutPaid — audited manual release, PENDING_PAYOUT → RELEASED"
```

---

### Task 8: Profile page `/dashboard/profile`

**Files:**
- Create: `src/app/dashboard/profile/page.tsx` (server component)
- Create: `src/app/dashboard/profile/profile-form.tsx` (client)
- Create: `src/app/dashboard/profile/payout-form.tsx` (client)

No unit tests for these (no component test setup in the repo); they are covered by the manual browser verification in Task 12. Follow the visual language of `src/app/(auth)/register/register-form.tsx` (inputClass, labels, primary buttons).

- [ ] **Step 1: Create the server page**

`src/app/dashboard/profile/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ProfileForm } from './profile-form'
import { PayoutForm } from './payout-form'

export default async function ProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, phone: true },
  })
  if (!user) redirect('/login')

  const profile =
    session.user.role === 'PROVIDER'
      ? await db.providerProfile.findUnique({
          where: { userId: session.user.id },
          select: {
            bio: true, skills: true, isRemote: true,
            address: true, latitude: true, longitude: true,
            payoutMethod: true, paypalEmail: true, tkieroAccount: true,
          },
        })
      : null

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-headline-lg-mobile text-primary">Mi perfil</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Tu información personal{profile ? ' y tu método de cobro' : ''}.
        </p>
      </div>

      <ProfileForm
        role={session.user.role}
        initial={{
          name: user.name,
          phone: user.phone ?? '',
          bio: profile?.bio ?? '',
          skills: profile?.skills ?? [],
          isRemote: profile?.isRemote ?? false,
          address: profile?.address ?? '',
          latitude: profile?.latitude ?? null,
          longitude: profile?.longitude ?? null,
        }}
      />

      {profile && (
        <PayoutForm
          initial={{
            payoutMethod: profile.payoutMethod,
            paypalEmail: profile.paypalEmail ?? '',
            tkieroAccount: profile.tkieroAccount ?? '',
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the profile form (client)**

`src/app/dashboard/profile/profile-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/actions/profile'
import { LocationPicker, type LocationValue } from '@/components/features/location-picker'
import { CATEGORY_LABELS } from '@/lib/categories'
import type { ServiceCategory, UserRole } from '@/types/index'

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

type ProfileInitial = {
  name: string
  phone: string
  bio: string
  skills: ServiceCategory[]
  isRemote: boolean
  address: string
  latitude: number | null
  longitude: number | null
}

export function ProfileForm({ role, initial }: { role: UserRole; initial: ProfileInitial }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [bio, setBio] = useState(initial.bio)
  const [skills, setSkills] = useState<ServiceCategory[]>(initial.skills)
  const [location, setLocation] = useState<LocationValue>({
    isRemote: initial.isRemote,
    address: initial.address,
    latitude: initial.latitude,
    longitude: initial.longitude,
  })
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function toggleSkill(skill: ServiceCategory) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const result = await updateProfile({
      name,
      phone,
      ...(role === 'PROVIDER'
        ? {
            bio,
            skills,
            isRemote: location.isRemote,
            address: location.isRemote ? undefined : location.address || undefined,
            latitude: location.isRemote ? undefined : location.latitude ?? undefined,
            longitude: location.isRemote ? undefined : location.longitude ?? undefined,
          }
        : {}),
    })
    setPending(false)
    if (result.success) {
      setMessage('Perfil actualizado')
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <h2 className="text-headline-md text-on-surface">Información personal</h2>

      <div>
        <label htmlFor="profile-name" className="text-label-md text-on-surface-variant block mb-1">Nombre completo</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      </div>

      <div>
        <label htmlFor="profile-phone" className="text-label-md text-on-surface-variant block mb-1">Teléfono</label>
        <input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputClass} />
      </div>

      {role === 'PROVIDER' && (
        <>
          <div>
            <label htmlFor="profile-bio" className="text-label-md text-on-surface-variant block mb-1">Bio</label>
            <textarea id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} className={inputClass} />
          </div>

          <div>
            <span className="text-label-md text-on-surface-variant block mb-2">Mis habilidades</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((value) => {
                const active = skills.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleSkill(value)}
                    className={`btn-press px-3 py-2.5 rounded-xl border text-left text-label-sm transition-colors ${
                      active
                        ? 'bg-primary border-primary text-on-primary'
                        : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary/60'
                    }`}
                  >
                    {CATEGORY_LABELS[value]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className="text-label-md text-on-surface-variant block mb-2">Mi ubicación</span>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
      >
        {pending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create the payout form (client)**

`src/app/dashboard/profile/payout-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayoutSettings } from '@/actions/payouts'
import type { PayoutMethod } from '@/types/index'

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

type PayoutInitial = {
  payoutMethod: PayoutMethod | null
  paypalEmail: string
  tkieroAccount: string
}

export function PayoutForm({ initial }: { initial: PayoutInitial }) {
  const router = useRouter()
  const [method, setMethod] = useState<PayoutMethod>(initial.payoutMethod ?? 'PAYPAL')
  const [paypalEmail, setPaypalEmail] = useState(initial.paypalEmail)
  const [tkieroAccount, setTkieroAccount] = useState(initial.tkieroAccount)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const result = await updatePayoutSettings(
      method === 'PAYPAL'
        ? { payoutMethod: 'PAYPAL', paypalEmail }
        : { payoutMethod: 'TKIERO', tkieroAccount },
    )
    setPending(false)
    if (result.success) {
      setMessage('Método de cobro guardado')
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-headline-md text-on-surface">Método de cobro</h2>
        <p className="text-body-md text-on-surface-variant mt-1">
          Aquí te depositaremos el pago de tus trabajos completados.
        </p>
      </div>

      {!initial.payoutMethod && (
        <div className="flex items-center gap-2 bg-primary-container text-on-primary-container rounded-xl px-4 py-3 text-label-md">
          <span className="material-symbols-outlined text-[18px]">info</span>
          Sin método de cobro configurado no podremos liquidarte los trabajos completados.
        </div>
      )}

      <div className="flex bg-surface-container rounded-full p-1 gap-1">
        {(['PAYPAL', 'TKIERO'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
              method === m ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            {m === 'PAYPAL' ? 'PayPal' : 'Tkiero'}
          </button>
        ))}
      </div>

      {method === 'PAYPAL' ? (
        <div>
          <label htmlFor="paypal-email" className="text-label-md text-on-surface-variant block mb-1">
            Email de tu cuenta PayPal
          </label>
          <input
            id="paypal-email"
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="tu-correo@ejemplo.com"
            required
            className={inputClass}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="tkiero-account" className="text-label-md text-on-surface-variant block mb-1">
            Cuenta Tkiero
          </label>
          <input
            id="tkiero-account"
            value={tkieroAccount}
            onChange={(e) => setTkieroAccount(e.target.value)}
            placeholder="@tu-cuenta"
            required
            className={inputClass}
          />
        </div>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
      >
        {pending ? 'Guardando...' : 'Guardar método de cobro'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Typecheck and eyeball in the browser**

Run: `npx tsc --noEmit`
Expected: exit 0.
Then with the dev server running, open `http://localhost:3000/dashboard/profile` logged in as the seed provider (`pedro@test.com` if present in seed output) and confirm both forms render and save.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/profile
git commit -m "feat(profile): /dashboard/profile — personal info + payout destination forms"
```

---

### Task 9: Admin payouts page `/dashboard/payouts`

**Files:**
- Create: `src/app/dashboard/payouts/page.tsx` (server)
- Create: `src/app/dashboard/payouts/mark-paid-button.tsx` (client)

- [ ] **Step 1: Create the server page**

`src/app/dashboard/payouts/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MarkPaidButton } from './mark-paid-button'

export default async function PayoutsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const payments = await db.jobPayment.findMany({
    where: { status: 'PENDING_PAYOUT' },
    include: {
      commission: true,
      jobPost: {
        select: {
          title: true,
          applications: {
            where: { status: 'ACCEPTED' },
            select: {
              provider: {
                select: {
                  name: true,
                  providerProfile: {
                    select: { payoutMethod: true, paypalEmail: true, tkieroAccount: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'asc' },
  })

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile text-primary">Liquidaciones pendientes</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Pagos retenidos de trabajos completados, listos para enviar al proveedor.
        </p>
      </div>

      {payments.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No hay liquidaciones pendientes.</p>
      ) : (
        <ul className="space-y-4">
          {payments.map((p) => {
            const provider = p.jobPost.applications[0]?.provider
            const profile = provider?.providerProfile
            const destination =
              profile?.payoutMethod === 'PAYPAL' ? profile.paypalEmail
              : profile?.payoutMethod === 'TKIERO' ? profile.tkieroAccount
              : null
            const gross = Number(p.amount)
            const fee = Number(p.commission?.amount ?? 0)
            return (
              <li key={p.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <p className="text-body-md font-medium text-on-surface">{p.jobPost.title}</p>
                    <p className="text-label-md text-on-surface-variant mt-1">
                      Proveedor: {provider?.name ?? '—'}
                    </p>
                    <p className="text-label-md text-on-surface-variant">
                      Bruto ${gross.toFixed(2)} · Comisión ${fee.toFixed(2)} ·{' '}
                      <span className="font-semibold text-on-surface">Neto ${(gross - fee).toFixed(2)}</span>
                    </p>
                    <p className="text-label-md text-on-surface-variant mt-1">
                      {destination
                        ? `${profile?.payoutMethod === 'PAYPAL' ? 'PayPal' : 'Tkiero'}: ${destination}`
                        : null}
                    </p>
                  </div>
                  {destination ? (
                    <MarkPaidButton jobPaymentId={p.id} />
                  ) : (
                    <span className="text-label-md bg-surface-container text-on-surface-variant px-3 py-1.5 rounded-full">
                      Bloqueado — sin destino de pago
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

Note: this assumes `User` has a `providerProfile` back-relation in the Prisma schema. Verify with `grep -n "providerProfile" prisma/schema.prisma` — if the relation has a different field name on `User`, use that name in the query.

- [ ] **Step 2: Create the mark-paid button (client)**

`src/app/dashboard/payouts/mark-paid-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markPayoutPaid } from '@/actions/payouts'

export function MarkPaidButton({ jobPaymentId }: { jobPaymentId: string }) {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState(false)

  async function handlePaid() {
    if (!confirm('¿Confirmas que ya enviaste el dinero al proveedor?')) return
    setPending(true)
    const result = await markPayoutPaid({
      jobPaymentId,
      reference: reference.trim() || undefined,
    })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al liquidar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Referencia (opcional)"
        className="border border-outline-variant rounded-lg px-3 py-1.5 text-label-md bg-surface-container-lowest focus:outline-none focus:border-primary"
      />
      <button
        onClick={handlePaid}
        disabled={pending}
        className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Liquidando...' : 'Marcar como pagado'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/payouts
git commit -m "feat(payouts): admin liquidation page with blocked rows for missing destinations"
```

---

### Task 10: Job-flow buttons and provider banner

**Files:**
- Create: `src/app/dashboard/applications/start-job-button.tsx`
- Modify: `src/app/dashboard/applications/page.tsx`
- Create: `src/app/dashboard/jobs/[id]/complete-job-button.tsx`
- Modify: `src/app/dashboard/jobs/[id]/page.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Start button (client)**

`src/app/dashboard/applications/start-job-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startJob } from '@/actions/jobs'

export function StartJobButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleStart() {
    setPending(true)
    const result = await startJob({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al iniciar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={pending}
      className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Iniciando...' : 'Iniciar trabajo'}
    </button>
  )
}
```

- [ ] **Step 2: Wire it into the applications page**

In `src/app/dashboard/applications/page.tsx`:
- Add `import { StartJobButton } from './start-job-button'`.
- Inside the applications list item markup (the `<li>` for each application — find the block rendering `app.jobPost.title` / status chip), render the button for accepted applications whose post is ASSIGNED:

```tsx
{app.status === 'ACCEPTED' && app.jobPost.status === 'ASSIGNED' && (
  <StartJobButton jobPostId={app.jobPost.id} />
)}
{app.status === 'ACCEPTED' && app.jobPost.status === 'IN_PROGRESS' && (
  <span className="text-label-sm text-on-surface-variant">En progreso — el cliente lo marcará como completado</span>
)}
```

(The `jobPost.select` in that page already includes `id` and `status`, so no query change is needed.)

- [ ] **Step 3: Complete button (client)**

`src/app/dashboard/jobs/[id]/complete-job-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeJob } from '@/actions/jobs'

export function CompleteJobButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleComplete() {
    if (!confirm('¿El trabajo está terminado a tu satisfacción? Esto inicia la liquidación al proveedor.')) return
    setPending(true)
    const result = await completeJob({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al completar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleComplete}
      disabled={pending}
      className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Completando...' : 'Marcar como completado'}
    </button>
  )
}
```

- [ ] **Step 4: Wire it into the client job detail page**

In `src/app/dashboard/jobs/[id]/page.tsx`:
- Add `import { CompleteJobButton } from './complete-job-button'`.
- After the status chip block (`<span ...>{job.status}</span>`), add:

```tsx
{job.status === 'IN_PROGRESS' && (
  <div className="mb-4">
    <CompleteJobButton jobPostId={job.id} />
  </div>
)}
```

- [ ] **Step 5: Provider banner on the dashboard home**

Replace `src/app/dashboard/page.tsx` with:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  let pendingPayoutTotal = 0
  let needsPayoutSetup = false

  if (session.user.role === 'PROVIDER') {
    const profile = await db.providerProfile.findUnique({
      where: { userId: session.user.id },
      select: { payoutMethod: true },
    })
    const pending = await db.jobPayment.findMany({
      where: {
        status: 'PENDING_PAYOUT',
        jobPost: {
          applications: { some: { status: 'ACCEPTED', providerId: session.user.id } },
        },
      },
      include: { commission: true },
    })
    pendingPayoutTotal = pending.reduce(
      (sum, p) => sum + Number(p.amount) - Number(p.commission?.amount ?? 0),
      0,
    )
    needsPayoutSetup = !profile?.payoutMethod && pending.length > 0
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>

      {needsPayoutSetup && (
        <div className="mt-4 flex items-center gap-3 bg-primary-container text-on-primary-container rounded-xl px-4 py-3">
          <span className="material-symbols-outlined">account_balance_wallet</span>
          <p className="text-label-md flex-1">
            Tienes ${pendingPayoutTotal.toFixed(2)} de trabajos completados esperando.
            Configura tu método de cobro para recibirlos.
          </p>
          <Link
            href="/dashboard/profile"
            className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md shrink-0"
          >
            Configurar
          </Link>
        </div>
      )}

      <p className="mt-2 text-zinc-500">Dashboard features coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard
git commit -m "feat(dashboard): start/complete job buttons and payout-setup banner"
```

---

### Task 11: Seed ADMIN user (env-gated)

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the admin block to `prisma/seed.ts`**

Inside `main()`, after the existing user creation block:

```ts
// ---- Admin (only when credentials are provided via env) ----
const adminEmail = process.env.ADMIN_EMAIL
const adminPassword = process.env.ADMIN_PASSWORD
if (adminEmail && adminPassword) {
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      name: 'Admin',
      role: 'ADMIN',
    },
  })
  console.log(`Admin user ensured: ${adminEmail}`)
}
```

- [ ] **Step 2: Document the env vars in `.env.example`**

Add under the App section:

```bash
# ─── Admin (optional, used by prisma/seed.ts) ────────────────────────────────
# When both are set, the seed creates/keeps an ADMIN user with these credentials.
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
```

- [ ] **Step 3: Run the seed against the dev DB**

Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in your local `.env`, then:
Run: `npm run db:seed`
Expected: "Admin user ensured: <email>" in the output.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts .env.example
git commit -m "feat(seed): env-gated admin user for payout operations"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite, typecheck, lint of touched files, build**

Run:
```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: everything green.

- [ ] **Step 2: Manual end-to-end flow in the browser** (dev server + seeded DB)

1. As seed client: create a job post, pay it (PayPal sandbox or simulate the webhook), confirm post becomes `OPEN`.
2. As seed provider: apply to the job.
3. As client: select the application → post `ASSIGNED`.
4. As provider: `/dashboard/applications` → "Iniciar trabajo" → post `IN_PROGRESS`.
5. As client: job detail → "Marcar como completado" → post `COMPLETED`; verify in DB that a `Commission` row exists for the `JobPayment` and the payment is `PENDING_PAYOUT`.
6. As provider WITHOUT payout configured: dashboard shows the banner with the net amount.
7. As admin: `/dashboard/payouts` shows the row as "Bloqueado — sin destino de pago".
8. As provider: configure PayPal email in `/dashboard/profile`.
9. As admin: the row now shows the destination + button → "Marcar como pagado" with a reference → row disappears; verify `Payout` row in DB and payment `RELEASED`.
10. Probe: re-running completeJob/markPayoutPaid on already-advanced records returns typed errors, never a second commission/payout.

- [ ] **Step 3: Check off Phase 1 items in CLAUDE.md roadmap**

Mark the completed Phase 1 checkboxes in `CLAUDE.md` (leave the Tkiero-release item unchecked — deferred by design).

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark phase 1 roadmap items complete"
```

---

## Self-review notes

- Spec coverage: states/lifecycle (Tasks 4, 5, 7), schema (Task 1), actions (Tasks 4–7), profile page (Task 8), admin payouts page (Task 9), provider visibility (Task 10), seed admin (Task 11), testing matrix (Tasks 2–7 + 12). Withholding rule covered by Task 7 (`payout_destination_missing`) + Task 9 (blocked rows) + Task 10 (banner).
- Type consistency: `recordJobCommission(tx, jobPaymentId, amount, category)` used identically in Tasks 3 and 5; `ActionResult` error strings match between implementations and tests; `PayoutMethod` TS type added in Task 1 and consumed in Task 8.
- Known check: Task 9 queries `provider.providerProfile` — field name must be verified against the schema before writing the page (instruction included in the task).
