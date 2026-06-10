# Phase 1 — Complete the money loop + provider payout settings — Design

Date: 2026-06-09
Status: Approved by user

## Problem

The escrow flow stops at `HELD`: clients pay, funds sit in custody, and there is
no way for a provider to ever get paid. `releaseToProvider()` and
`recordCommission()` exist in `lib/` but nothing calls them. Job lifecycle stops
at `ASSIGNED`. Additionally, the platform has nowhere to send money: providers
have no payout destination on file.

## Decisions (user-confirmed)

1. **Manual payout with registry** — the platform owner sends money manually
   (PayPal or Tkiero app) and marks the payment as paid in an admin-only page.
   No PayPal Payouts API for the MVP (requires special account approval).
   This uniformly covers both PayPal and Tkiero while the Tkiero API contract
   remains unconfirmed.
2. **Automatic liquidation on configure** — when a provider with completed jobs
   and withheld funds saves a payout destination, those payments become
   liquidatable immediately (they appear in the admin payout queue). No extra
   action needed from the provider.
3. **Full editable profile** — the profile page edits name, phone, bio, skills,
   location, and payout settings (not just payout).

## 1. States and lifecycle

New `JobPaymentStatus` value: **`PENDING_PAYOUT`**, between `HELD` and `RELEASED`:

```
JobPayment: PENDING → HELD → PENDING_PAYOUT → RELEASED   (or → REFUNDED)
JobPost:    PENDING_PAYMENT → OPEN → ASSIGNED → IN_PROGRESS → COMPLETED
```

- The **accepted provider** moves `ASSIGNED → IN_PROGRESS` ("Iniciar trabajo").
- The **owning client** moves `IN_PROGRESS → COMPLETED`. Inside the same Prisma
  `$transaction`: the commission is recorded and the payment moves
  `HELD → PENDING_PAYOUT`. If commission recording fails, everything rolls
  back — "commission before funds move" holds atomically.
- The **admin** moves `PENDING_PAYOUT → RELEASED` from the payouts page after
  manually sending the money.
- Backwards transitions are impossible: every action validates the exact prior
  state and is tested for the forbidden cases.

The withholding rule needs no extra state: a `PENDING_PAYOUT` payment is
liquidatable only if its provider has a payout destination configured. Saving
the destination makes pending payments appear in the admin queue automatically.

## 2. Schema changes (one migration)

- `enum PayoutMethod { PAYPAL, TKIERO }`
- `ProviderProfile` adds: `payoutMethod PayoutMethod?`, `paypalEmail String?`,
  `tkieroAccount String?`
- `Commission`: `transactionId` becomes optional; adds
  `jobPaymentId String? @unique` with a relation to `JobPayment`. The migration
  adds a SQL CHECK constraint: exactly one of `transactionId` / `jobPaymentId`
  is non-null.
- New model **`Payout`** (audit trail — real money):
  - `id`, `jobPaymentId @unique` (relation), `providerId` (relation to User),
    `amount Decimal(10,2)` (net = payment − commission), `method PayoutMethod`,
    `destination String` (snapshot of the email/account at pay time),
    `paidById` (admin User), `reference String?` (PayPal/Tkiero transaction id),
    `createdAt`.
- `prisma/seed.ts`: creates an ADMIN user only when `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` env vars are present (never hardcoded credentials).

## 3. Server actions

In `src/actions/jobs.ts`:

- `startJob(jobPostId)` — caller must be the provider of the ACCEPTED
  application; post must be `ASSIGNED`. Moves post to `IN_PROGRESS`.
- `completeJob(jobPostId)` — caller must be the owning client; post must be
  `IN_PROGRESS` and payment `HELD`. In one `$transaction`: create `Commission`
  (rate by category from `lib/commission.ts`), payment → `PENDING_PAYOUT`,
  post → `COMPLETED`.

In new `src/actions/payouts.ts`:

- `updatePayoutSettings(input)` — provider-only; Zod-validated (see §4).
- `markPayoutPaid(jobPaymentId, reference?)` — ADMIN-only. Payment must be
  `PENDING_PAYOUT` and the provider must have a destination configured. In one
  `$transaction`: create `Payout` + payment → `RELEASED`.

In new `src/actions/profile.ts`:

- `updateProfile(input)` — name, phone for everyone; bio, skills, location for
  providers. Zod-validated.

All follow the existing `ActionResult` pattern with typed error strings and the
re-check-inside-transaction concurrency pattern used by `selectJobApplication`.

## 4. Profile page `/dashboard/profile`

- Everyone: name, phone.
- PROVIDER additionally: bio, skills selector (same UI as register), location
  via the existing `LocationPicker` (with address autocomplete), and a
  **Payout destination** section: method (PayPal / Tkiero), then PayPal email
  or Tkiero account depending on method.
- Zod rules: choosing a method makes its destination field required; PayPal
  email must be a valid email; Tkiero account is a non-empty trimmed string.
- Two separate forms with separate actions (`updateProfile`,
  `updatePayoutSettings`) — money settings change independently of bio edits.
- Password change is out of scope (Phase 3).

## 5. Admin payouts page `/dashboard/payouts`

ADMIN-only (redirect non-admins). Lists `PENDING_PAYOUT` payments: job title,
provider name, gross amount, commission, net amount, method + destination.

- Provider without destination → row renders "Bloqueado — sin destino de pago",
  no action button.
- Provider with destination → "Marcar como pagado" button + optional reference
  input; calls `markPayoutPaid`.

This is a single operational page, not the general admin panel (still out of
scope per CLAUDE.md).

## 6. Provider-facing visibility

- Provider dashboard: if they have `PENDING_PAYOUT` payments and no destination
  configured, show a banner "Configura tu método de pago para recibir $X"
  linking to `/dashboard/profile`.
- `/dashboard/applications`: accepted applications show the "Iniciar trabajo"
  button (when post is `ASSIGNED`) and the job/payment status.
- `/dashboard/jobs/[id]` (client view): "Marcar como completado" button when
  `IN_PROGRESS`.

## 7. Error handling

- Every action returns typed `ActionResult` errors; no silent failures.
- `completeJob` and `markPayoutPaid` re-validate state inside the transaction
  to prevent double-completion / double-payout races (same pattern as
  `selectJobApplication`).
- Commission creation failure aborts the whole completion transaction.

## 8. Testing

- Action tests (existing mocked-db pattern in `src/actions/__tests__/`):
  - every valid transition; every forbidden one (wrong state, wrong role,
    not the owner, not the accepted provider)
  - `completeJob` atomicity: commission failure → nothing changes
  - `markPayoutPaid` rejected without configured destination
  - `updatePayoutSettings` validation matrix
- Zod schema tests for profile and payout settings.
- Manual browser verification of the full flow at the end (register → post →
  pay (sandbox) → apply → select → start → complete → configure payout →
  admin marks paid).

## Out of scope (later phases)

- Reviews (Phase 2), emails/password reset (Phase 3), cancellations/refunds
  (Phase 4), PayPal Payouts API automation, Tkiero automatic release, general
  admin panel.
