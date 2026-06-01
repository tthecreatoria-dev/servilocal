# Job Payment Deposit — Design Spec

**Date:** 2026-05-28  
**Status:** Approved

---

## Overview

When a client creates a job post the record starts with `status: PENDING_PAYMENT`. The client must deposit the full budget into the platform's escrow before the job becomes visible to providers (`status: OPEN`). Two payment methods are supported: **PayPal Orders API** and **Tkiero QR**.

The current implementation has no real payment verification — any client can advance the job to `OPEN` by clicking a button without paying. This spec defines the correct, server-verified deposit flow.

---

## Data Models

### New enum `JobPaymentStatus`

```prisma
enum JobPaymentStatus {
  PENDING    // payment initiated, not yet confirmed
  HELD       // funds received, held in escrow
  RELEASED   // funds released to provider
  REFUNDED   // funds returned to client
}
```

### New model `JobPayment`

```prisma
model JobPayment {
  id              String           @id @default(cuid())
  jobPostId       String           @unique
  amount          Decimal          @db.Decimal(10, 2)
  method          PaymentMethod
  status          JobPaymentStatus @default(PENDING)
  tkieroPaymentId String?
  paypalOrderId   String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  jobPost         JobPost          @relation(fields: [jobPostId], references: [id], onDelete: Restrict)

  @@index([tkieroPaymentId])
  @@index([paypalOrderId])
}
```

`@@unique` on `jobPostId` guarantees exactly one payment record per job. The indexes on `tkieroPaymentId` and `paypalOrderId` allow fast webhook lookups.

### Change to `JobPost`

Add inverse relation:

```prisma
payment  JobPayment?
```

---

## Environment Variables

### New (PayPal Orders API)

```bash
PAYPAL_CLIENT_ID=      # from PayPal Developer Console
PAYPAL_SECRET=         # app secret from PayPal Developer Console
PAYPAL_BASE_URL=       # https://api-m.sandbox.paypal.com or https://api-m.paypal.com
```

`PAYPAL_EMAIL` is no longer used and can be removed.

---

## API Routes

### `POST /api/payments/paypal/create-order`

Query param: `jobId`

**Steps:**
1. Verify session; reject with 401 if unauthenticated
2. Load `JobPost` — reject with 404 if not found, 403 if `clientId` ≠ session user
3. If `JobPost.status` ≠ `PENDING_PAYMENT` and existing `JobPayment.status` is `HELD`, redirect to `/dashboard/jobs/{jobId}` (already paid)
4. Obtain a PayPal access token via `POST /v1/oauth2/token` with `client_credentials`
5. Call `POST /v2/checkout/orders` with:
   - `intent: CAPTURE`
   - `amount.value`: job budget
   - `amount.currency_code: USD`
   - `return_url`: `{APP_URL}/api/payments/paypal/success?jobId={jobId}`
   - `cancel_url`: `{APP_URL}/dashboard/jobs/{jobId}/pay`
6. Upsert `JobPayment`: `method: PAYPAL`, `status: PENDING`, `paypalOrderId` from PayPal response (upsert allows retry if a previous pending order exists)
7. Redirect 302 to the PayPal `approve` link from the response

---

### `GET /api/payments/paypal/success` (replace existing logic)

Query params: `jobId`, `token` (PayPal sets this to the order ID on redirect)

**Steps:**
1. Call `POST /v2/checkout/orders/{token}/capture` with server credentials
2. If capture fails → redirect to `/dashboard/jobs/{jobId}/pay?error=paypal_failed`
3. If capture succeeds → `prisma.$transaction`:
   - `JobPayment.status = HELD`
   - `JobPost.status = OPEN`
4. Redirect to `/dashboard/jobs/{jobId}?paid=1`

Idempotent: if `JobPayment` is already `HELD` (duplicate redirect), skip DB writes and redirect to success.

---

### `GET /api/payments/tkiero/create`

Query param: `jobId`

**Steps:**
1. Verify session; reject with 401 if unauthenticated
2. Load `JobPost` — reject with 404 if not found, 403 if `clientId` ≠ session user
3. If `JobPost.status` ≠ `PENDING_PAYMENT` and existing `JobPayment.status` is `HELD`, redirect to `/dashboard/jobs/{jobId}` (already paid)
4. If a `JobPayment` with `method: TKIERO` and `status: PENDING` already exists, reuse its `tkieroPaymentId` (skip API call)
5. Otherwise call `getTkiero().createPayment(budget, 'USD', { jobPostId, clientId })`
6. Create `JobPayment`: `method: TKIERO`, `status: PENDING`, `tkieroPaymentId`
7. Redirect 302 to `/dashboard/jobs/{jobId}/pay?tkieroPaymentId={tkieroPaymentId}`

---

## Tkiero Webhook Extension

File: `src/app/api/payments/webhook/route.ts`

The existing webhook verifies the HMAC signature — this does not change.

### Updated `PaymentMetadata` in `src/lib/tkiero.ts`

```ts
export type PaymentMetadata =
  | { jobPostId: string; clientId: string; serviceRequestId?: never; providerId?: never; category?: never }
  | { serviceRequestId: string; clientId: string; providerId: string; category: string; jobPostId?: never }
```

### Updated `TkieroWebhookSchema` in `src/types/schemas.ts`

The `metadata` field is extended to accept `jobPostId` as an alternative to `serviceRequestId`.

### Webhook routing logic for `payment.confirmed`

```
if metadata.jobPostId:
  Find JobPayment by tkieroPaymentId
  If not found: log error, return 200 (do not retry)
  If already HELD: return 200 (idempotent)
  prisma.$transaction:
    → JobPayment.status = HELD
    → JobPost.status = OPEN

if metadata.serviceRequestId:
  → existing logic unchanged
```

---

## Payment Page Changes

File: `src/app/dashboard/jobs/[id]/pay/page.tsx`

**Tkiero section:**
- On page load, check if a `JobPayment` with `method: TKIERO` and `status: PENDING` exists
- If `tkieroPaymentId` query param is present, fetch the QR code URL from Tkiero and display the real QR
- If no `tkieroPaymentId`, show a "Generar QR" button that links to `/api/payments/tkiero/create?jobId={id}`
- Remove the "Ya escaneé el QR" button and the `confirmJobPayment` form entirely

**PayPal section:**
- Replace the `<form>` that posts to `paypal.com` with a plain link to `/api/payments/paypal/create-order?jobId={id}`
- Show error message if `?error=paypal_failed` is present in the URL

---

## Removed

- `confirmJobPayment` server action in `src/actions/jobs.ts` — no longer needed; both payment methods confirm via server-side verification
- `PAYPAL_EMAIL` environment variable
- The manual "Ya escaneé el QR" form in the payment page

---

## Error Handling

| Situation | Behavior |
|---|---|
| `JobPayment` already `HELD` | Redirect to `/dashboard/jobs/{id}` — already paid |
| PayPal capture fails | Redirect to `/pay?error=paypal_failed`, `JobPayment` stays `PENDING` |
| Tkiero webhook arrives, no `JobPayment` found | Log error, respond 200 |
| Tkiero webhook arrives, `JobPayment` already `HELD` | Respond 200, no DB writes (idempotent) |
| PayPal success URL hit twice | `JobPayment` already `HELD`, skip writes, redirect to success |

---

## Atomicity

Every transition that touches more than one table uses `prisma.$transaction`:
- PayPal capture success: `JobPayment.status = HELD` + `JobPost.status = OPEN`
- Tkiero webhook confirmed: `JobPayment.status = HELD` + `JobPost.status = OPEN`

If either write fails, neither is applied.

---

## Security

- All payment-initiation routes verify session and job ownership before calling external APIs
- PayPal payment capture is done server-side — the client cannot self-certify payment success
- Tkiero webhook signature verification is unchanged (HMAC-SHA256)
- `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` are server-only — never exposed to the client bundle
- `TKIERO_API_KEY` and `TKIERO_WEBHOOK_SECRET` are server-only — unchanged

---

## Out of Scope

- Fund release to provider (handled in a later iteration when the job is marked complete)
- Commission recording for job payments (also a later iteration — commission is calculated at completion, not deposit)
- Refund flow UI (model supports it, UI is not built)
- Dispute resolution
