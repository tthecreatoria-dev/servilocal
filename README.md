# ServiLocal

A local services marketplace for El Salvador — plumbers, teachers, delivery drivers, designers, and freelancers, all paid in **Tkiero** (a local cryptocurrency).

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use the Prisma local dev server: `npx prisma dev`)

### Install

```bash
git clone <repo>
cd servilocal
npm install
cp .env.example .env
# Fill in all values in .env
```

### Database

```bash
npx prisma migrate dev   # applies migrations + generates Prisma client
```

### Run

```bash
npm run dev              # http://localhost:3000
npm test                 # unit tests (vitest)
npm run build            # production build
```

---

## Architecture

```
src/
├── app/
│   ├── (auth)/           # /login, /register — public, centered layout
│   ├── (marketplace)/    # / — public marketplace home
│   ├── dashboard/        # /dashboard — protected, requires JWT
│   └── api/
│       ├── auth/         # NextAuth handlers — /api/auth/*
│       ├── services/     # Service CRUD — /api/services
│       └── payments/
│           └── webhook/  # Tkiero webhook — /api/payments/webhook
├── components/
│   ├── ui/               # Primitive: Button, Input, Card
│   └── features/         # Domain: ServiceCard, ReviewStars, etc.
├── lib/
│   ├── db.ts             # Prisma singleton (uses @prisma/adapter-pg)
│   ├── tkiero.ts         # ALL Tkiero API calls — nowhere else
│   ├── commission.ts     # Commission rate table + recording
│   └── auth.ts           # NextAuth config
├── actions/              # Server actions for data mutations
├── types/                # Shared types, Zod schemas, NextAuth augmentation
└── middleware.ts         # JWT protection for /dashboard and /api/services
```

## Payment Escrow Flow

```
1. Client initiates → Transaction{status: PENDING} created
2. Tkiero confirms  → webhook fires → status: HELD
3. Client marks complete → commission calculated + recorded
4. Commission recorded in DB → THEN status: RELEASED
5. tkiero.releaseToProvider() sends funds to provider
```

**Critical invariant:** Commission must be recorded before funds move. If `recordCommission()` fails, the release is aborted. Funds stay HELD until the issue is resolved.

## Commission Rates

| Category | Rate |
|----------|------|
| DELIVERY | 15%  |
| PLUMBING | 12%  |
| CLEANING | 12%  |
| TEACHING | 10%  |
| DESIGN   | 10%  |
| DIGITAL  |  8%  |

Rates live in `src/lib/commission.ts`. Do not hardcode elsewhere.

## Database

Prisma 7 with `@prisma/adapter-pg` and PostgreSQL. Monetary fields use `Decimal(18, 8)` to avoid float precision issues. All FK relationships protecting payment records use `onDelete: Restrict`.

## Tkiero API

The Tkiero API contract is not yet fully confirmed. All calls go through `src/lib/tkiero.ts`. The webhook signature header name (`x-tkiero-signature`) and HMAC format must be confirmed with the Tkiero team before launch.

## Environment Variables

See `.env.example` for all required variables. Never commit `.env`.
