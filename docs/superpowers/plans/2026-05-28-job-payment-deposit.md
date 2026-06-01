# Job Payment Deposit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the insecure manual payment confirmation with verified PayPal Orders API and real Tkiero QR deposit flows so a `JobPost` only moves to `OPEN` after server-confirmed payment.

**Architecture:** A new `JobPayment` model tracks payment state per job. Two new API routes initiate payments (`/api/payments/paypal/create-order`, `/api/payments/tkiero/create`) and redirect externally. The existing PayPal success route is replaced with a server-side capture call; the existing Tkiero webhook is extended to handle job payments alongside the existing service-request flow.

**Tech Stack:** Next.js 15 App Router, Prisma 7, PayPal Orders REST API v2 (native fetch), Tkiero API (axios via existing `TkieroClient`), Vitest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | Add `JobPaymentStatus` enum, `JobPayment` model, `payment` relation on `JobPost` |
| Modify | `src/types/schemas.ts` | Extend `TkieroWebhookSchema` metadata to discriminated union |
| Modify | `src/lib/tkiero.ts` | Update `PaymentMetadata` to discriminated union; add `qrCodeUrl?` to `TkieroPayment` |
| Create | `src/lib/paypal.ts` | All PayPal API calls: `createPayPalOrder`, `capturePayPalOrder` |
| Create | `src/lib/__tests__/paypal.test.ts` | Unit tests for PayPal lib |
| Create | `src/app/api/payments/paypal/create-order/route.ts` | Create PayPal order + redirect to PayPal |
| Replace | `src/app/api/payments/paypal/success/route.ts` | Capture PayPal order + atomic DB update |
| Create | `src/app/api/payments/tkiero/create/route.ts` | Call Tkiero API + redirect back to pay page |
| Modify | `src/app/api/payments/webhook/route.ts` | Handle `jobPostId` branch in `payment.confirmed` |
| Modify | `src/app/dashboard/jobs/[id]/pay/page.tsx` | Show real QR when tkieroPaymentId param exists; PayPal link; error message |
| Modify | `src/actions/jobs.ts` | Remove `confirmJobPayment` |
| Modify | `src/actions/__tests__/jobs.test.ts` | Remove `confirmJobPayment` test references |

---

## Task 1: Schema — Add `JobPayment` model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the enum and model**

Open `prisma/schema.prisma`. After the `JobApplicationStatus` enum (around line 55) add:

```prisma
enum JobPaymentStatus {
  PENDING
  HELD
  RELEASED
  REFUNDED
}
```

After the `JobApplication` model, add:

```prisma
model JobPayment {
  id              String           @id @default(cuid())
  jobPostId       String           @unique
  amount          Decimal          @db.Decimal(10, 2)
  method          PaymentMethod
  status          JobPaymentStatus @default(PENDING)
  tkieroPaymentId String?
  paypalOrderId   String?
  qrCodeUrl       String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  jobPost         JobPost          @relation(fields: [jobPostId], references: [id], onDelete: Restrict)

  @@index([tkieroPaymentId])
  @@index([paypalOrderId])
}
```

In the `JobPost` model, add the inverse relation after `applications JobApplication[]`:

```prisma
payment  JobPayment?
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_job_payment
```

Expected: migration file created in `prisma/migrations/`, no errors.

- [ ] **Step 3: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` in output, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add JobPayment model and JobPaymentStatus enum"
```

---

## Task 2: Update `TkieroWebhookSchema` to support `jobPostId`

**Files:**
- Modify: `src/types/schemas.ts`

- [ ] **Step 1: Write the failing test**

The current `TkieroWebhookSchema` requires `serviceRequestId` in metadata — it should also accept `jobPostId`. Add a test file `src/types/__tests__/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TkieroWebhookSchema } from '@/types/schemas'

const base = {
  event: 'payment.confirmed' as const,
  paymentId: 'pay_123',
  amount: 100,
  timestamp: '2026-05-28T00:00:00Z',
}

describe('TkieroWebhookSchema', () => {
  it('accepts serviceRequest metadata', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { serviceRequestId: 'req_1', clientId: 'usr_1', providerId: 'usr_2', category: 'DELIVERY' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts jobPost metadata', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects metadata with neither serviceRequestId nor jobPostId', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { clientId: 'usr_1' },
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run src/types/__tests__/schemas.test.ts
```

Expected: FAIL — "jobPost metadata" and "neither" cases fail because current schema requires `serviceRequestId`.

- [ ] **Step 3: Update the schema**

In `src/types/schemas.ts`, replace `TkieroWebhookSchema` with:

```ts
export const TkieroWebhookSchema = z.object({
  event: z.enum(['payment.confirmed', 'payment.failed', 'payment.refunded']),
  paymentId: z.string(),
  amount: z.number().positive(),
  metadata: z.union([
    z.object({ jobPostId: z.string(), clientId: z.string() }),
    z.object({ serviceRequestId: z.string(), clientId: z.string(), providerId: z.string(), category: z.string() }),
  ]),
  timestamp: z.string(),
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/types/__tests__/schemas.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/types/__tests__/schemas.test.ts
git commit -m "feat: extend TkieroWebhookSchema metadata to support jobPostId"
```

---

## Task 3: Update `PaymentMetadata` in `src/lib/tkiero.ts`

**Files:**
- Modify: `src/lib/tkiero.ts`
- Modify: `src/lib/__tests__/tkiero.test.ts`

- [ ] **Step 1: Update `PaymentMetadata` and `TkieroPayment` types**

In `src/lib/tkiero.ts`, replace the `PaymentMetadata` type (lines 4–9) with:

```ts
export type PaymentMetadata =
  | { jobPostId: string; clientId: string; serviceRequestId?: never; providerId?: never; category?: never }
  | { serviceRequestId: string; clientId: string; providerId: string; category: string; jobPostId?: never }
```

In the same file, add `qrCodeUrl?: string` to `TkieroPayment`:

```ts
export type TkieroPayment = {
  id: string
  amount: number
  currency: 'USD'
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'REFUNDED'
  qrCodeUrl?: string  // NOTE: confirm exact field name with Tkiero team
  metadata: PaymentMetadata
  createdAt: string
}
```

- [ ] **Step 2: Update the existing tkiero test to use the new metadata shape**

In `src/lib/__tests__/tkiero.test.ts`, the `createPayment` tests pass a `serviceRequestId` metadata. This still compiles. Add one more test for the `jobPostId` variant inside `describe('createPayment')`:

```ts
it('accepts jobPost metadata', async () => {
  const mockPayment = {
    id: 'pay_456',
    amount: 200,
    currency: 'USD',
    status: 'PENDING',
    metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
    createdAt: '2026-05-28T00:00:00Z',
  }
  vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockPayment })

  const result = await client.createPayment(200, 'USD', {
    jobPostId: 'job_1',
    clientId: 'usr_1',
  })

  expect(mockHttp.post).toHaveBeenCalledWith('/payments', {
    amount: 200,
    currency: 'USD',
    metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
  })
  expect(result.id).toBe('pay_456')
})
```

- [ ] **Step 3: Run all tkiero tests**

```bash
npx vitest run src/lib/__tests__/tkiero.test.ts
```

Expected: all passing (including the new test).

- [ ] **Step 4: Commit**

```bash
git add src/lib/tkiero.ts src/lib/__tests__/tkiero.test.ts
git commit -m "feat: update PaymentMetadata to discriminated union, add qrCodeUrl to TkieroPayment"
```

---

## Task 4: Create `src/lib/paypal.ts`

**Files:**
- Create: `src/lib/paypal.ts`
- Create: `src/lib/__tests__/paypal.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/paypal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Set required env vars before importing the module
vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client-id')
vi.stubEnv('PAYPAL_SECRET', 'test-secret')
vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com')

import { createPayPalOrder, capturePayPalOrder, PayPalApiError } from '@/lib/paypal'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockTokenResponse() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'test-token' }),
  })
}

describe('createPayPalOrder', () => {
  it('returns orderId and approveUrl on success', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'ORDER_123',
        status: 'CREATED',
        links: [
          { href: 'https://paypal.com/approve', rel: 'payer-action', method: 'GET' },
        ],
      }),
    })

    const result = await createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel')

    expect(result).toEqual({ orderId: 'ORDER_123', approveUrl: 'https://paypal.com/approve' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws PayPalApiError when token request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })

  it('throws PayPalApiError when order creation fails', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })

  it('throws PayPalApiError when payer-action link is missing', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ORDER_123', status: 'CREATED', links: [] }),
    })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })
})

describe('capturePayPalOrder', () => {
  it('returns capture data on success', async () => {
    mockTokenResponse()
    const capture = {
      id: 'ORDER_123',
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'cap_1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '100.00' } }] } }],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => capture })

    const result = await capturePayPalOrder('ORDER_123')

    expect(result.purchase_units[0].payments.captures[0].status).toBe('COMPLETED')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_123/capture',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws PayPalApiError when capture fails', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(capturePayPalOrder('ORDER_123')).rejects.toThrow(PayPalApiError)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run src/lib/__tests__/paypal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/paypal.ts`**

```ts
// All PayPal API calls go through this file — never call PayPal endpoints directly from routes or actions

export type PayPalCapture = {
  id: string
  status: string
  purchase_units: Array<{
    payments: {
      captures: Array<{ id: string; status: string; amount: { currency_code: string; value: string } }>
    }
  }>
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'PayPalApiError'
  }
}

async function getAccessToken(): Promise<string> {
  const clientId = requireEnv('PAYPAL_CLIENT_ID')
  const secret = requireEnv('PAYPAL_SECRET')
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new PayPalApiError('Failed to get PayPal access token', res.status)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function createPayPalOrder(
  amount: string,
  jobId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ orderId: string; approveUrl: string }> {
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const token = await getAccessToken()

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: amount }, custom_id: jobId }],
      payment_source: {
        paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl } },
      },
    }),
  })
  if (!res.ok) throw new PayPalApiError('Failed to create PayPal order', res.status)

  const data = (await res.json()) as { id: string; links: Array<{ href: string; rel: string }> }
  const approveUrl = data.links.find((l) => l.rel === 'payer-action')?.href
  if (!approveUrl) throw new PayPalApiError('No payer-action link in PayPal response', 500)

  return { orderId: data.id, approveUrl }
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalCapture> {
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const token = await getAccessToken()

  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new PayPalApiError('Failed to capture PayPal order', res.status)

  return res.json() as Promise<PayPalCapture>
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/paypal.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paypal.ts src/lib/__tests__/paypal.test.ts
git commit -m "feat: add PayPal Orders API lib with createPayPalOrder and capturePayPalOrder"
```

---

## Task 5: Create PayPal create-order route

**Files:**
- Create: `src/app/api/payments/paypal/create-order/route.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/api/payments/paypal/__tests__/create-order.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.hoisted(() => vi.fn())
const mockJobPostFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpsert = vi.hoisted(() => vi.fn())
const mockCreatePayPalOrder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    jobPost: { findUnique: mockJobPostFindUnique },
    jobPayment: { upsert: mockJobPaymentUpsert },
  },
}))
vi.mock('@/lib/paypal', () => ({ createPayPalOrder: mockCreatePayPalOrder }))

import { GET } from '@/app/api/payments/paypal/create-order/route'

const clientSession = { user: { id: 'client-1', role: 'CLIENT' } }

function makeRequest(jobId: string) {
  return new NextRequest(`http://localhost/api/payments/paypal/create-order?jobId=${jobId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

describe('GET /api/payments/paypal/create-order', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when jobId is missing', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const req = new NextRequest('http://localhost/api/payments/paypal/create-order')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when job not found', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when job belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'other-client', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(403)
  })

  it('redirects to PayPal approve URL on success', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    mockCreatePayPalOrder.mockResolvedValueOnce({ orderId: 'ORDER_1', approveUrl: 'https://paypal.com/approve/ORDER_1' })
    mockJobPaymentUpsert.mockResolvedValueOnce({})

    const res = await GET(makeRequest('job-1'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://paypal.com/approve/ORDER_1')
    expect(mockJobPaymentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobPostId: 'job-1' },
      create: expect.objectContaining({ method: 'PAYPAL', status: 'PENDING', paypalOrderId: 'ORDER_1' }),
    }))
  })

  it('redirects to dashboard when job payment is already HELD', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'OPEN', budget: '100.00', payment: { status: 'HELD' } })

    const res = await GET(makeRequest('job-1'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard/jobs/job-1')
    expect(mockCreatePayPalOrder).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run "src/app/api/payments/paypal/__tests__/create-order.test.ts"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/payments/paypal/create-order/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createPayPalOrder } from '@/lib/paypal'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await db.jobPost.findUnique({
    where: { id: jobId },
    select: { clientId: true, status: true, budget: true, payment: { select: { status: true } } },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (job.clientId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (job.payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }
  if (job.status !== 'PENDING_PAYMENT') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { orderId, approveUrl } = await createPayPalOrder(
    Number(job.budget).toFixed(2),
    jobId,
    `${appUrl}/api/payments/paypal/success?jobId=${jobId}`,
    `${appUrl}/dashboard/jobs/${jobId}/pay`,
  )

  await db.jobPayment.upsert({
    where: { jobPostId: jobId },
    create: { jobPostId: jobId, amount: job.budget, method: 'PAYPAL', status: 'PENDING', paypalOrderId: orderId },
    update: { paypalOrderId: orderId, status: 'PENDING' },
  })

  return NextResponse.redirect(approveUrl)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run "src/app/api/payments/paypal/__tests__/create-order.test.ts"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/paypal/create-order/route.ts "src/app/api/payments/paypal/__tests__/create-order.test.ts"
git commit -m "feat: add PayPal create-order route"
```

---

## Task 6: Replace PayPal success route with capture logic

**Files:**
- Replace: `src/app/api/payments/paypal/success/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/payments/paypal/__tests__/success.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockJobPaymentFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockJobPostUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockTransaction = vi.hoisted(() => vi.fn())
const mockCapturePayPalOrder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    jobPayment: { findUnique: mockJobPaymentFindUnique, update: mockJobPaymentUpdate },
    jobPost: { update: mockJobPostUpdate },
    $transaction: mockTransaction,
  },
}))
vi.mock('@/lib/paypal', () => ({ capturePayPalOrder: mockCapturePayPalOrder }))

import { GET } from '@/app/api/payments/paypal/success/route'

function makeRequest(jobId: string, token: string) {
  return new NextRequest(`http://localhost/api/payments/paypal/success?jobId=${jobId}&token=${token}`)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/payments/paypal/success', () => {
  it('redirects to /dashboard/jobs when jobId or token is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/payments/paypal/success'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard/jobs')
  })

  it('redirects to success when payment already HELD (idempotent)', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'HELD' })
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paid=1')
    expect(mockCapturePayPalOrder).not.toHaveBeenCalled()
  })

  it('redirects to pay page with error when capture status is not COMPLETED', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockResolvedValueOnce({
      id: 'ORDER_1',
      status: 'VOIDED',
      purchase_units: [{ payments: { captures: [{ id: 'c1', status: 'DECLINED', amount: {} }] } }],
    })
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paypal_failed')
  })

  it('redirects to pay page with error when capture throws', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockRejectedValueOnce(new Error('PayPal API down'))
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paypal_failed')
  })

  it('runs atomic DB update and redirects to success on completed capture', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockResolvedValueOnce({
      id: 'ORDER_1',
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'c1', status: 'COMPLETED', amount: {} }] } }],
    })
    mockTransaction.mockResolvedValueOnce([{}, {}])

    const res = await GET(makeRequest('job-1', 'ORDER_1'))

    expect(mockTransaction).toHaveBeenCalledWith(expect.arrayContaining([
      expect.anything(),
      expect.anything(),
    ]))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paid=1')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run "src/app/api/payments/paypal/__tests__/success.test.ts"
```

Expected: FAIL — current route does not call `capturePayPalOrder`.

- [ ] **Step 3: Replace the route**

Overwrite `src/app/api/payments/paypal/success/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { capturePayPalOrder } from '@/lib/paypal'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = req.nextUrl.searchParams.get('jobId')
  const token = req.nextUrl.searchParams.get('token')

  if (!jobId || !token) {
    return NextResponse.redirect(new URL('/dashboard/jobs', req.url))
  }

  const payment = await db.jobPayment.findUnique({
    where: { jobPostId: jobId },
    select: { status: true },
  })

  if (payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}?paid=1`, req.url))
  }

  try {
    const capture = await capturePayPalOrder(token)
    const captureStatus = capture.purchase_units[0]?.payments.captures[0]?.status
    if (captureStatus !== 'COMPLETED') {
      return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}/pay?error=paypal_failed`, req.url))
    }
  } catch {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}/pay?error=paypal_failed`, req.url))
  }

  await db.$transaction([
    db.jobPayment.update({ where: { jobPostId: jobId }, data: { status: 'HELD' } }),
    db.jobPost.update({ where: { id: jobId }, data: { status: 'OPEN' } }),
  ])

  return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}?paid=1`, req.url))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run "src/app/api/payments/paypal/__tests__/success.test.ts"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/paypal/success/route.ts "src/app/api/payments/paypal/__tests__/success.test.ts"
git commit -m "feat: replace PayPal success route with server-side capture verification"
```

---

## Task 7: Create Tkiero payment initiation route

**Files:**
- Create: `src/app/api/payments/tkiero/create/route.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/api/payments/tkiero/__tests__/create.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.hoisted(() => vi.fn())
const mockJobPostFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpsert = vi.hoisted(() => vi.fn())
const mockGetTkiero = vi.hoisted(() => vi.fn())
const mockCreatePayment = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    jobPost: { findUnique: mockJobPostFindUnique },
    jobPayment: { upsert: mockJobPaymentUpsert },
  },
}))
vi.mock('@/lib/tkiero', () => ({ getTkiero: mockGetTkiero }))

import { GET } from '@/app/api/payments/tkiero/create/route'

const clientSession = { user: { id: 'client-1', role: 'CLIENT' } }

function makeRequest(jobId: string) {
  return new NextRequest(`http://localhost/api/payments/tkiero/create?jobId=${jobId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTkiero.mockReturnValue({ createPayment: mockCreatePayment })
})

describe('GET /api/payments/tkiero/create', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when job not found', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when job belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'other', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(403)
  })

  it('reuses existing pending Tkiero payment without calling API', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({
      clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00',
      payment: { status: 'PENDING', tkieroPaymentId: 'pay_existing', method: 'TKIERO' },
    })
    const res = await GET(makeRequest('job-1'))
    expect(mockCreatePayment).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toContain('pay_existing')
  })

  it('calls Tkiero API and redirects with new tkieroPaymentId on success', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    mockCreatePayment.mockResolvedValueOnce({ id: 'pay_new', qrCodeUrl: 'https://qr.tkiero.io/pay_new' })
    mockJobPaymentUpsert.mockResolvedValueOnce({})

    const res = await GET(makeRequest('job-1'))

    expect(mockCreatePayment).toHaveBeenCalledWith(100, 'USD', { jobPostId: 'job-1', clientId: 'client-1' })
    expect(mockJobPaymentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tkieroPaymentId: 'pay_new', qrCodeUrl: 'https://qr.tkiero.io/pay_new' }),
    }))
    expect(res.headers.get('location')).toContain('pay_new')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run "src/app/api/payments/tkiero/__tests__/create.test.ts"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/payments/tkiero/create/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getTkiero } from '@/lib/tkiero'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await db.jobPost.findUnique({
    where: { id: jobId },
    select: {
      clientId: true,
      status: true,
      budget: true,
      payment: { select: { status: true, tkieroPaymentId: true, method: true } },
    },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (job.clientId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (job.payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }
  if (job.status !== 'PENDING_PAYMENT') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }

  // Reuse existing pending Tkiero payment — avoids creating duplicate payments
  if (job.payment?.method === 'TKIERO' && job.payment.tkieroPaymentId) {
    return NextResponse.redirect(
      new URL(`/dashboard/jobs/${jobId}/pay?tkieroPaymentId=${job.payment.tkieroPaymentId}`, req.url),
    )
  }

  const tkieroPayment = await getTkiero().createPayment(Number(job.budget), 'USD', {
    jobPostId: jobId,
    clientId: session.user.id,
  })

  await db.jobPayment.upsert({
    where: { jobPostId: jobId },
    create: {
      jobPostId: jobId,
      amount: job.budget,
      method: 'TKIERO',
      status: 'PENDING',
      tkieroPaymentId: tkieroPayment.id,
      qrCodeUrl: tkieroPayment.qrCodeUrl ?? null,
    },
    update: {
      method: 'TKIERO',
      status: 'PENDING',
      tkieroPaymentId: tkieroPayment.id,
      qrCodeUrl: tkieroPayment.qrCodeUrl ?? null,
    },
  })

  return NextResponse.redirect(
    new URL(`/dashboard/jobs/${jobId}/pay?tkieroPaymentId=${tkieroPayment.id}`, req.url),
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run "src/app/api/payments/tkiero/__tests__/create.test.ts"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/tkiero/create/route.ts "src/app/api/payments/tkiero/__tests__/create.test.ts"
git commit -m "feat: add Tkiero payment initiation route"
```

---

## Task 8: Extend Tkiero webhook to handle job payments

**Files:**
- Modify: `src/app/api/payments/webhook/route.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/api/payments/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'node:crypto'

const mockTransactionUpdateMany = vi.hoisted(() => vi.fn())
const mockJobPaymentFindFirst = vi.hoisted(() => vi.fn())
const mockPrismaTransaction = vi.hoisted(() => vi.fn())
const mockJobPaymentUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockJobPostUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))

vi.mock('@/lib/db', () => ({
  db: {
    transaction: { updateMany: mockTransactionUpdateMany },
    jobPayment: { findFirst: mockJobPaymentFindFirst, update: mockJobPaymentUpdate },
    jobPost: { update: mockJobPostUpdate },
    $transaction: mockPrismaTransaction,
  },
}))

import { POST } from '@/app/api/payments/webhook/route'

const SECRET = 'test-webhook-secret'

function makeSignedRequest(body: object) {
  const raw = JSON.stringify(body)
  const sig = crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
  return new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'x-tkiero-signature': sig, 'content-type': 'application/json' },
    body: raw,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TKIERO_WEBHOOK_SECRET = SECRET
})

const jobPaymentConfirmed = {
  event: 'payment.confirmed',
  paymentId: 'pay_123',
  amount: 100,
  metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
  timestamp: '2026-05-28T00:00:00Z',
}

const serviceRequestConfirmed = {
  event: 'payment.confirmed',
  paymentId: 'pay_456',
  amount: 100,
  metadata: { serviceRequestId: 'req_1', clientId: 'usr_1', providerId: 'usr_2', category: 'DELIVERY' },
  timestamp: '2026-05-28T00:00:00Z',
}

describe('POST /api/payments/webhook', () => {
  it('returns 401 for invalid signature', async () => {
    const req = new NextRequest('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-tkiero-signature': 'badhex00', 'content-type': 'application/json' },
      body: JSON.stringify(jobPaymentConfirmed),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('updates JobPayment and JobPost for payment.confirmed with jobPostId', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce({ id: 'jp_1', jobPostId: 'job_1', status: 'PENDING' })
    mockPrismaTransaction.mockResolvedValueOnce([{}, {}])

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ])
    expect(mockTransactionUpdateMany).not.toHaveBeenCalled()
  })

  it('returns 200 without DB writes when JobPayment is already HELD (idempotent)', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce({ id: 'jp_1', jobPostId: 'job_1', status: 'HELD' })

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('returns 200 without DB writes when JobPayment not found (logs error)', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce(null)

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('updates Transaction for payment.confirmed with serviceRequestId (existing flow)', async () => {
    mockTransactionUpdateMany.mockResolvedValueOnce({ count: 1 })

    const res = await POST(makeSignedRequest(serviceRequestConfirmed))

    expect(res.status).toBe(200)
    expect(mockTransactionUpdateMany).toHaveBeenCalledWith({
      where: { serviceRequestId: 'req_1', status: 'PENDING' },
      data: { status: 'HELD', tkieroPaymentId: 'pay_456' },
    })
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run "src/app/api/payments/__tests__/webhook.test.ts"
```

Expected: FAIL — current webhook does not handle `jobPostId` in metadata.

- [ ] **Step 3: Update the webhook handler**

Replace the try/catch block in `src/app/api/payments/webhook/route.ts` (lines 55–80):

```ts
  try {
    if (event === 'payment.confirmed') {
      if ('jobPostId' in metadata && metadata.jobPostId) {
        const jobPayment = await db.jobPayment.findFirst({ where: { tkieroPaymentId: paymentId } })
        if (!jobPayment) {
          console.error(`JobPayment not found for tkieroPaymentId: ${paymentId}`)
          return NextResponse.json({ received: true })
        }
        if (jobPayment.status === 'HELD') {
          return NextResponse.json({ received: true })
        }
        await db.$transaction([
          db.jobPayment.update({ where: { id: jobPayment.id }, data: { status: 'HELD' } }),
          db.jobPost.update({ where: { id: jobPayment.jobPostId }, data: { status: 'OPEN' } }),
        ])
      } else if ('serviceRequestId' in metadata && metadata.serviceRequestId) {
        await db.transaction.updateMany({
          where: { serviceRequestId: metadata.serviceRequestId, status: 'PENDING' },
          data: { status: 'HELD', tkieroPaymentId: paymentId },
        })
      }
    } else if (event === 'payment.failed') {
      if ('serviceRequestId' in metadata && metadata.serviceRequestId) {
        await db.transaction.updateMany({
          where: { serviceRequestId: metadata.serviceRequestId, status: 'PENDING' },
          data: { status: 'REFUNDED' },
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook DB update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run "src/app/api/payments/__tests__/webhook.test.ts"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/webhook/route.ts "src/app/api/payments/__tests__/webhook.test.ts"
git commit -m "feat: extend Tkiero webhook to handle job payment confirmation"
```

---

## Task 9: Update the payment page UI

**Files:**
- Modify: `src/app/dashboard/jobs/[id]/pay/page.tsx`

- [ ] **Step 1: Update the page to accept searchParams**

The page currently only accepts `params`. In Next.js 15, `searchParams` is also an async prop. Replace the entire file with:

```tsx
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'

export default async function PayJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tkieroPaymentId?: string; error?: string }>
}) {
  const { id } = await params
  const { tkieroPaymentId, error } = await searchParams

  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  const job = await db.jobPost.findUnique({
    where: { id },
    select: { id: true, title: true, budget: true, status: true, clientId: true },
  })
  if (!job) notFound()
  if (job.clientId !== session.user.id) redirect('/dashboard/jobs')
  if (job.status !== 'PENDING_PAYMENT') redirect(`/dashboard/jobs/${id}`)

  const budget = Number(job.budget)
  const fee = budget * 0.10

  // Load QR URL from JobPayment if tkieroPaymentId param is present
  let qrCodeUrl: string | null = null
  if (tkieroPaymentId) {
    const jobPayment = await db.jobPayment.findUnique({
      where: { jobPostId: id },
      select: { qrCodeUrl: true },
    })
    qrCodeUrl = jobPayment?.qrCodeUrl ?? null
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 mb-6 shadow-sm">
        <p className="text-label-sm text-on-surface-variant mb-1">Completar pago para</p>
        <h1 className="text-headline-lg-mobile text-primary mb-4">{job.title}</h1>

        <div className="border-t border-outline-variant pt-4 space-y-2">
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Presupuesto del proyecto</span>
            <span className="text-on-surface font-medium">${budget.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Comisión de plataforma (10%)</span>
            <span className="text-on-surface font-medium">−${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-label-md text-on-surface border-t border-outline-variant pt-2 mt-2">
            <span>Total a pagar ahora</span>
            <span className="text-primary text-headline-md">${budget.toFixed(2)}</span>
          </div>
          <p className="text-label-sm text-on-surface-variant/70">
            El proveedor recibirá ${(budget - fee).toFixed(2)} al completar el trabajo. La comisión cubre la administración y custodia del pago.
          </p>
        </div>
      </div>

      {/* Payment methods */}
      <p className="text-label-md text-on-surface-variant mb-4">Elige cómo pagar</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Tkiero QR */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-primary text-[24px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              qr_code_scanner
            </span>
            <span className="text-label-md text-on-surface">Tkiero QR</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-4">
            {qrCodeUrl ? (
              <>
                <img
                  src={qrCodeUrl}
                  alt="Tkiero QR de pago"
                  className="w-44 h-44 rounded-xl border border-outline-variant"
                />
                <p className="text-label-sm text-on-surface-variant text-center mt-3">
                  Monto: <strong className="text-on-surface">${budget.toFixed(2)}</strong>
                </p>
                <p className="text-label-sm text-on-surface-variant/60 text-center mt-1">
                  Escanea con tu app de Tkiero. El proyecto se activará automáticamente al confirmar el pago.
                </p>
              </>
            ) : (
              <>
                <div className="w-44 h-44 bg-surface-container border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-outline text-[64px]">qr_code_2</span>
                </div>
                <p className="text-label-sm text-on-surface-variant/60 text-center mt-1">
                  Genera el QR para ver el monto y escanear con tu app de Tkiero
                </p>
                <a
                  href={`/api/payments/tkiero/create?jobId=${id}`}
                  className="btn-press mt-4 w-full bg-primary text-on-primary py-3 rounded-full text-label-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
                  Generar QR
                </a>
              </>
            )}
          </div>
        </div>

        {/* PayPal */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-primary text-[24px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              credit_card
            </span>
            <span className="text-label-md text-on-surface">PayPal</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-16 h-16 bg-[#003087] rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl" style={{ fontFamily: 'Arial, sans-serif' }}>P</span>
            </div>
            <p className="text-body-md text-on-surface-variant text-center">
              Serás redirigido a PayPal para completar el pago de forma segura.
            </p>
            <p className="text-label-sm text-on-surface-variant/60 text-center">
              Acepta tarjeta de crédito, débito y saldo PayPal
            </p>
            {error === 'paypal_failed' && (
              <p className="text-label-sm text-error text-center">
                El pago con PayPal no se completó. Por favor intenta de nuevo.
              </p>
            )}
          </div>

          <a
            href={`/api/payments/paypal/create-order?jobId=${id}`}
            className="btn-press mt-4 w-full bg-[#0070ba] text-white py-3 rounded-full text-label-md hover:bg-[#003087] transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
            Pagar con PayPal
          </a>
        </div>

      </div>

      <p className="text-label-sm text-on-surface-variant/60 text-center mt-6">
        Tu pago quedará en custodia hasta que confirmes que el trabajo fue completado.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
npx vitest run
```

Expected: all existing tests pass. No TypeScript errors related to the page.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/jobs/\[id\]/pay/page.tsx
git commit -m "feat: update pay page with real Tkiero QR display and PayPal Orders API link"
```

---

## Task 10: Remove `confirmJobPayment` and clean up tests

**Files:**
- Modify: `src/actions/jobs.ts`
- Modify: `src/actions/__tests__/jobs.test.ts`

- [ ] **Step 1: Remove `confirmJobPayment` from actions**

In `src/actions/jobs.ts`, delete the entire `confirmJobPayment` function (lines 41–63).

- [ ] **Step 2: Remove `confirmJobPayment` references from the test file**

In `src/actions/__tests__/jobs.test.ts`:
- Remove `confirmJobPayment` from the import on line 25
- If any `describe('confirmJobPayment()')` block exists, delete it entirely

- [ ] **Step 3: Run tests to confirm everything passes**

```bash
npx vitest run
```

Expected: all tests pass. Zero references to `confirmJobPayment` remain.

- [ ] **Step 4: Add the new PayPal env vars to `.env.example` or wherever env vars are documented**

In `.env.local` (or wherever the project documents env vars locally), add:

```bash
PAYPAL_CLIENT_ID=      # from PayPal Developer Console
PAYPAL_SECRET=         # app secret from PayPal Developer Console
PAYPAL_BASE_URL=       # https://api-m.sandbox.paypal.com (sandbox) or https://api-m.paypal.com (prod)
```

Remove or comment out `PAYPAL_EMAIL`.

- [ ] **Step 5: Final test run**

```bash
npx vitest run
```

Expected: all tests passing, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat: remove confirmJobPayment — payment confirmation is now server-verified"
```

---

## Notes

- **Tkiero `qrCodeUrl`**: The `qrCodeUrl` field is added to `TkieroPayment` as optional since the Tkiero API contract is not yet confirmed. If Tkiero does not return this field, the pay page falls back to the "Generar QR" button flow and the QR is not displayed. Confirm the exact field name with the Tkiero team.
- **PayPal `payer-action` link**: PayPal returns a `payer-action` rel link for the approve URL. This was verified against the PayPal Orders API v2 documentation. If PayPal sandbox returns a different `rel` value, update the `find` in `src/lib/paypal.ts`.
- **Commission**: No commission is calculated at deposit time. The 10% deduction shown in the UI is informational. Commission recording happens when the job is marked complete (a separate future iteration).
