# CLAUDE.md — ServiLocal

This file is read automatically by Claude Code at the start of every session.
Do not delete or move it. Update it as the project evolves.

---

## What is ServiLocal

A local services marketplace for El Salvador — think Fiverr but for physical and digital
services paid in **Tkiero**, a local cryptocurrency. Clients hire plumbers, teachers,
delivery drivers, designers, and freelancers. The platform earns a commission on every
completed transaction.

This is a real product with real money moving through it. Every decision around payments,
commissions, and transaction state must be treated with production-level care.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| Styling | Tailwind CSS |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth v5, credentials + JWT |
| Payments | Tkiero API (external crypto payment provider) |
| Validation | Zod — on every input, always |
| Deployment | TBD |

---

## Folder structure

```
src/
├── app/
│   ├── (auth)/           # Public auth pages: login, register
│   ├── (marketplace)/    # Public pages: home, search, service detail
│   ├── dashboard/        # Protected: provider and client dashboards
│   └── api/
│       ├── auth/         # NextAuth handlers only
│       ├── services/     # CRUD for service listings
│       └── payments/
│           └── webhook/  # Tkiero webhook receiver — critical path
├── components/
│   ├── ui/               # Primitive components (button, input, card)
│   └── features/         # Domain components (ServiceCard, ReviewStars, etc.)
├── lib/
│   ├── db.ts             # Prisma client singleton
│   ├── tkiero.ts         # ALL Tkiero API calls live here — nowhere else
│   ├── commission.ts     # Commission calculation and recording
│   └── auth.ts           # NextAuth config
├── actions/              # Server actions for all data mutations
├── types/                # Shared TypeScript types and Zod schemas
└── middleware.ts         # Route protection
```

---

## Business rules — never break these

These are not preferences. They are invariants that protect real user funds.

### Payment flow

1. Client initiates payment → `Transaction` created with `status: PENDING`
2. Tkiero confirms payment received → `status` moves to `HELD`
3. Client marks service as complete → commission is calculated and recorded
4. Commission recorded in `Commission` table → THEN and only then `status` moves to `RELEASED`
5. Funds released to provider via `tkiero.releaseToProvider()`

**Never skip step 4. Never release funds without a recorded commission entry.**

### Critical rules

- **All Tkiero API calls must go through `src/lib/tkiero.ts`** — never import or call
  the Tkiero API from a component, server action, or any other file directly
- **Webhook at `/api/payments/webhook` must verify `TKIERO_WEBHOOK_SECRET` signature**
  on every request before touching the database — reject unsigned requests with 401
- **Transaction status is append-only in practice** — never go backwards
  (RELEASED → HELD is forbidden, HELD → PENDING is forbidden)
- **Commission must be recorded before funds move** — if commission recording fails,
  abort the release and log the error; do not silently continue
- **No payment logic in React components** — components call server actions,
  server actions call lib functions, lib functions call Tkiero

---

## Commission rates by category

| Category | Commission |
|---|---|
| DELIVERY | 15% |
| PLUMBING | 12% |
| CLEANING | 12% |
| ELECTRICAL | 10% |
| MASONRY | 10% |
| WELDING | 10% |
| ELECTRONICS | 10% |
| APPLIANCE_REPAIR | 10% |
| TEACHING | 10% |
| DESIGN | 10% |
| DIGITAL | 8% |

These live in `src/lib/commission.ts` as a constant. Do not hardcode them elsewhere.

---

## Code conventions

- **TypeScript strict mode** — no `any`, no `@ts-ignore`, no type assertions without comment
- **Zod on every input** — API routes, server actions, webhook payloads — everything external
- **Server actions for mutations** — form submissions and data writes use `actions/`
- **API routes only for** — webhook receivers and integrations that require raw request access
- **Explicit error handling** — no silent failures, especially in payment flows. Every
  function that touches money must return a typed result or throw a typed error
- **No default exports** — named exports only, for better refactoring and discoverability
- **Prisma transactions for multi-step writes** — any operation that writes to more than
  one table must use `prisma.$transaction()`

---

## Environment variables

```bash
# Database
DATABASE_URL=               # PostgreSQL connection string

# Auth
NEXTAUTH_SECRET=            # Random 32-char secret for JWT signing
NEXTAUTH_URL=               # Full app URL (http://localhost:3000 in dev)

# Tkiero payment API
TKIERO_API_KEY=             # API key provided by Tkiero team
TKIERO_BASE_URL=            # Base URL of Tkiero API (confirm with their team)
TKIERO_WEBHOOK_SECRET=      # Secret for verifying webhook signatures

# App
NEXT_PUBLIC_APP_URL=        # Public-facing URL (used in emails, redirects)
```

Never log these values. Never expose `TKIERO_API_KEY` or `TKIERO_WEBHOOK_SECRET`
to the client bundle — they must only be used in server-side code.

---

## Tkiero API

The Tkiero API contract is **not yet fully confirmed** — coordinate with the Tkiero team
before implementing or assuming any endpoint shape.

Known methods in `src/lib/tkiero.ts`:

```ts
createPayment(amount: number, currency: 'USD', metadata: PaymentMetadata)
verifyPayment(paymentId: string)
releaseToProvider(paymentId: string, providerId: string, amount: number)
refund(paymentId: string, reason: string)
```

**If the Tkiero API contract changes, update this file and `src/lib/tkiero.ts` together.**
Do not update one without the other.

---

## Data models (summary)

- `User` — role: `CLIENT | PROVIDER | ADMIN`
- `ProviderProfile` — linked to User, contains bio, category, rating
- `Service` — listing created by a provider with price in Tkiero
- `ServiceRequest` — a client requesting a specific service
- `Transaction` — status: `PENDING | HELD | RELEASED | DISPUTED | REFUNDED`
- `Commission` — one entry per completed transaction, records fee amount and rate
- `Review` — left by client after service completion, triggers fund release flow

---

## What is NOT built yet

Do not implement, scaffold, or reference these unless explicitly asked:

- Real-time chat between client and provider
- Mobile app (React Native or otherwise)
- Admin panel
- Push notifications
- Provider verification / KYC flow
- Multi-language support
- Dispute resolution UI (the model exists, the UI does not)
- Analytics dashboard

---

## When in doubt

- Ask before assuming anything about the Tkiero API
- Ask before adding a new dependency
- Ask before changing transaction sta
- tus logic
- Never move money without a recorded commission

---

## Roadmap to production

Phases to complete before launch, in order. Work on ONE phase at a time —
do not start a phase until the previous one is merged. Mark items as done
as they land. (Audit date: 2026-06-09; build, tests, and auth were green.)

### Phase 1 — Complete the money loop (CRITICAL, blocks launch)

The escrow flow currently stops at `HELD`: money comes in but can never reach
the provider. `releaseToProvider()` and `recordCommission()` exist in `lib/`
but nothing calls them.

- [x] Server action: provider marks job `IN_PROGRESS` (from `ASSIGNED`)
- [x] Server action: client marks job `COMPLETED` — records the commission
      FIRST, then advances `JobPayment` `HELD → PENDING_PAYOUT` atomically in
      one `$transaction` (abort if commission recording fails). Final release
      to `RELEASED` happens via the admin payout flow below.
- [x] Release path for PayPal payments — documented manual process: admin
      `/dashboard/payouts` page + `markPayoutPaid` action creates an auditable
      `Payout` row and moves `PENDING_PAYOUT → RELEASED`. (Tkiero auto-release
      deferred until their API contract is confirmed.)
- [x] Dashboard UI: state transition buttons for both roles
- [x] Tests for every state transition, including the forbidden backwards ones

### Phase 2 — Reviews

The `Review` model exists with zero UI/actions. Per the business rules, the
client review is part of the completion flow.

- [ ] Server action: client leaves rating + comment after `COMPLETED`
- [ ] Recalculate and store provider rating on `ProviderProfile`
- [ ] Show reviews on provider cards and provider search results
- [ ] One review per transaction, client-only, enforced server-side

### Phase 3 — Account recovery + transactional email

Credentials auth with no email layer: a user who forgets their password
loses the account, and neither party is notified of marketplace events.

- [ ] Pick email provider (Resend suggested — ask before adding the dependency)
- [ ] Password reset flow (token, expiry, single-use)
- [ ] Email verification on signup
- [ ] Event emails: application received, application accepted, payment
      received, job completed / funds released

### Phase 4 — Cancellations & refunds

`refund()` exists in `lib/tkiero.ts` but is never called; `CANCELLED` status
is never assigned; webhook ignores `payment.failed` for `JobPayment`.

- [ ] Client cancels a job before assignment → refund + `CANCELLED`
- [ ] Define and implement cancellation policy after assignment
- [ ] Handle `payment.failed` for `JobPayment` in the webhook
- [ ] Refund path for PayPal payments

### Phase 5 — Operations: CI, deploy, monitoring, rate limiting

- [ ] GitHub Actions: `tsc --noEmit` + `npm test` + `npm run build` on every PR
- [ ] Deploy target (Vercel + Supabase fits the stack) with env vars set
- [ ] Error monitoring (Sentry or similar) — payment flows and webhook
      failures must alert, not die in `console.error`
- [ ] Rate limiting on `/login`, `/register`, and payment endpoints
- [ ] Guard `prisma/seed.ts` so it can never run against production

### Phase 6 — Launch hardening

- [ ] Terms of service + privacy policy pages (required — the platform
      holds third-party funds in escrow)
- [ ] Confirm Tkiero API contract (webhook signature header name, base URL)
      and remove the TODO in `api/payments/webhook/route.ts` — or formally
      defer Tkiero to post-launch
- [ ] ESLint cleanup: ignore `src/generated/`, fix remaining real errors
- [ ] Update this file: document PayPal, the `JobPost`/`JobApplication`/
      `JobPayment` models, and `proxy.ts` (this file still says `middleware.ts`)
