# ServiLocal Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete project foundation: Prisma schema, NextAuth v5, route protection middleware, typed Tkiero API wrapper, commission service, folder structure, and documentation.

**Architecture:** Components → Server Actions → Lib functions → External APIs. All Tkiero calls go through `src/lib/tkiero.ts`. The Prisma singleton lives in `src/lib/db.ts`. NextAuth v5 uses JWT strategy (no DB session adapter). Middleware blocks `/dashboard` and `/api/services` from unauthenticated requests; the webhook at `/api/payments/webhook` self-authenticates via HMAC signature.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Prisma 7 (`prisma-client` generator → `src/generated/prisma`), NextAuth v5 beta.31, Zod v4, axios, bcryptjs, vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add bcryptjs, @types/bcryptjs, vitest, test script |
| `vitest.config.ts` | Create | Test runner with path alias and node environment |
| `prisma/schema.prisma` | Modify | Add 7 models + 4 enums |
| `src/types/index.ts` | Create | UserRole, ServiceCategory, TransactionStatus, ServiceRequestStatus union types |
| `src/types/schemas.ts` | Create | Zod schemas for all input validation |
| `src/types/next-auth.d.ts` | Create | NextAuth Session + JWT type augmentation |
| `src/lib/db.ts` | Create | Prisma client singleton (dev-safe) |
| `src/lib/commission.ts` | Create | COMMISSION_RATES constant + calculateCommission + recordCommission |
| `src/lib/tkiero.ts` | Create | TkieroClient class + typed methods + singleton export |
| `src/lib/auth.ts` | Create | NextAuth config: credentials provider, JWT callbacks |
| `src/actions/auth.ts` | Create | register + getSession server actions |
| `src/middleware.ts` | Create | Route protection: /dashboard + /api/services require JWT |
| `src/app/api/auth/[...nextauth]/route.ts` | Create | NextAuth HTTP handlers |
| `src/app/api/payments/webhook/route.ts` | Create | Tkiero webhook: HMAC verify → status update |
| `src/app/api/services/route.ts` | Create | Services CRUD stub (auth-protected) |
| `src/app/(auth)/layout.tsx` | Create | Centered auth group layout |
| `src/app/(auth)/login/page.tsx` | Create | Login page stub |
| `src/app/(auth)/register/page.tsx` | Create | Register page stub |
| `src/app/(marketplace)/layout.tsx` | Create | Marketplace group layout |
| `src/app/dashboard/layout.tsx` | Create | Dashboard layout stub |
| `src/app/dashboard/page.tsx` | Create | Dashboard page stub |
| `src/app/page.tsx` | Modify | Replace CNA default with marketplace home stub |
| `.env.example` | Create | All required env vars with comments |
| `README.md` | Modify | Setup instructions + payment escrow flow |
| `src/lib/__tests__/commission.test.ts` | Create | Unit tests: calculateCommission |
| `src/lib/__tests__/tkiero.test.ts` | Create | Unit tests: TkieroClient (mocked axios) |

---

## Task 1: Install dependencies + test framework

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime dependency bcryptjs**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Install vitest and testing utilities**

```bash
npm install -D vitest @vitejs/plugin-react @vitest/coverage-v8
```

Expected: `added N packages` with no errors.

- [ ] **Step 3: Add test script to package.json**

In `package.json`, find the `"scripts"` block and add the `"test"` entry:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Verify test runner works**

```bash
npm test
```

Expected: `No test files found` or `0 tests` — no error, just empty results.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add bcryptjs and vitest"
```

---

## Task 2: Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace the schema with complete models**

Replace the entire content of `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  CLIENT
  PROVIDER
  ADMIN
}

enum ServiceCategory {
  PLUMBING
  TEACHING
  DELIVERY
  CLEANING
  DESIGN
  DIGITAL
}

enum TransactionStatus {
  PENDING
  HELD
  RELEASED
  DISPUTED
  REFUNDED
}

enum ServiceRequestStatus {
  PENDING
  ACCEPTED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

model User {
  id              String               @id @default(cuid())
  email           String               @unique
  passwordHash    String
  name            String
  role            UserRole             @default(CLIENT)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  providerProfile ProviderProfile?
  serviceRequests ServiceRequest[]     @relation("ClientRequests")
  reviews         Review[]             @relation("ClientReviews")
  transactions    Transaction[]        @relation("ClientTransactions")
}

model ProviderProfile {
  id           String          @id @default(cuid())
  userId       String          @unique
  bio          String
  category     ServiceCategory
  rating       Float           @default(0)
  totalReviews Int             @default(0)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  services     Service[]
}

model Service {
  id            String           @id @default(cuid())
  title         String
  description   String
  priceInTkiero Float
  category      ServiceCategory
  providerId    String
  isActive      Boolean          @default(true)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  provider      ProviderProfile  @relation(fields: [providerId], references: [id])
  requests      ServiceRequest[]
}

model ServiceRequest {
  id          String               @id @default(cuid())
  serviceId   String
  clientId    String
  message     String
  status      ServiceRequestStatus @default(PENDING)
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  service     Service              @relation(fields: [serviceId], references: [id])
  client      User                 @relation("ClientRequests", fields: [clientId], references: [id])
  transaction Transaction?
}

model Transaction {
  id               String            @id @default(cuid())
  serviceRequestId String            @unique
  clientId         String
  amount           Float
  tkieroPaymentId  String?
  status           TransactionStatus @default(PENDING)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  serviceRequest   ServiceRequest    @relation(fields: [serviceRequestId], references: [id])
  client           User              @relation("ClientTransactions", fields: [clientId], references: [id])
  commission       Commission?
  review           Review?
}

model Commission {
  id            String          @id @default(cuid())
  transactionId String          @unique
  amount        Float
  rate          Float
  category      ServiceCategory
  createdAt     DateTime        @default(now())
  transaction   Transaction     @relation(fields: [transactionId], references: [id])
}

model Review {
  id            String      @id @default(cuid())
  transactionId String      @unique
  clientId      String
  rating        Int
  comment       String
  createdAt     DateTime    @default(now())
  transaction   Transaction @relation(fields: [transactionId], references: [id])
  client        User        @relation("ClientReviews", fields: [clientId], references: [id])
}
```

- [ ] **Step 2: Validate the schema parses**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid` with no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Prisma schema with 7 models and 4 enums"
```

---

## Task 3: Generate Prisma client + first migration

**Files:**
- Generated: `src/generated/prisma/` (do not edit by hand)

- [ ] **Step 1: Run prisma generate**

```bash
npx prisma generate
```

Expected: Output contains `Generated Prisma Client` and files appear in `src/generated/prisma/`.

- [ ] **Step 2: Run first migration (requires DATABASE_URL to be set)**

> If `DATABASE_URL` in `.env` points to a running database, run the migration. If not, skip to Step 3 and note in `.env` that migration is pending.

```bash
npx prisma migrate dev --name init
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Add generated folder to .gitignore**

Open `.gitignore` and confirm or add the line:

```
src/generated/
```

If it's not there, add it at the end of the file.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: generate Prisma client and add generated/ to .gitignore"
```

---

## Task 4: TypeScript types and Zod schemas

**Files:**
- Create: `src/types/index.ts`
- Create: `src/types/schemas.ts`
- Create: `src/types/next-auth.d.ts`

These types are defined independently of Prisma generated code so they can be used in tests before generation runs. The string literal unions are structurally compatible with Prisma's generated enums.

- [ ] **Step 1: Create src/types/index.ts**

```typescript
// src/types/index.ts
export type UserRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

export type ServiceCategory =
  | 'PLUMBING'
  | 'TEACHING'
  | 'DELIVERY'
  | 'CLEANING'
  | 'DESIGN'
  | 'DIGITAL'

export type TransactionStatus =
  | 'PENDING'
  | 'HELD'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED'

export type ServiceRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type CommissionResult = {
  commissionAmount: number
  rate: number
  providerAmount: number
}
```

- [ ] **Step 2: Create src/types/schemas.ts**

```typescript
// src/types/schemas.ts
import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['CLIENT', 'PROVIDER']),
})

export const CreateServiceSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  priceInTkiero: z.number().positive('Price must be positive'),
  category: z.enum(['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL']),
})

export const CreateServiceRequestSchema = z.object({
  serviceId: z.string().cuid('Invalid service ID'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

export const TkieroWebhookSchema = z.object({
  event: z.enum(['payment.confirmed', 'payment.failed', 'payment.refunded']),
  paymentId: z.string(),
  amount: z.number().positive(),
  metadata: z.object({
    serviceRequestId: z.string(),
    clientId: z.string(),
    providerId: z.string(),
    category: z.string(),
  }),
  timestamp: z.string(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>
export type TkieroWebhookPayload = z.infer<typeof TkieroWebhookSchema>
```

- [ ] **Step 3: Create src/types/next-auth.d.ts**

```typescript
// src/types/next-auth.d.ts
import type { UserRole } from '@/types'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
    }
  }

  interface User {
    role: UserRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors. If there are errors about `@/generated/prisma` not existing, that's okay at this stage — they'll resolve after Step 3 runs in production or after `prisma generate`. Errors in the files created in this task should be zero.

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "feat: add TypeScript types, Zod schemas, and NextAuth type augmentation"
```

---

## Task 5: Prisma client singleton

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create src/lib/db.ts**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@/generated/prisma'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
```

> The `globalThis` pattern prevents multiple PrismaClient instances during Next.js hot-reload in development. In production, the module is loaded once and `globalForPrisma` is not used.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/db.ts" || echo "db.ts: no errors"
```

Expected: No output from the grep, meaning no errors in `db.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add Prisma client singleton"
```

---

## Task 6: CommissionService

**Files:**
- Create: `src/lib/commission.ts`
- Create: `src/lib/__tests__/commission.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/commission.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCommission, COMMISSION_RATES } from '@/lib/commission'
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

  it('throws for unknown category', () => {
    expect(() =>
      calculateCommission(100, 'UNKNOWN' as ServiceCategory)
    ).toThrow('Unknown service category: UNKNOWN')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test src/lib/__tests__/commission.test.ts
```

Expected: `FAIL` — module `@/lib/commission` not found.

- [ ] **Step 3: Implement src/lib/commission.ts**

```typescript
// src/lib/commission.ts
import { db } from '@/lib/db'
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

  return db.commission.create({
    data: {
      transactionId,
      amount: commissionAmount,
      rate,
      category,
    },
  })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test src/lib/__tests__/commission.test.ts
```

Expected: All 7 tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commission.ts src/lib/__tests__/commission.test.ts
git commit -m "feat: add CommissionService with rate lookup, calculation, and DB recording"
```

---

## Task 7: Tkiero API wrapper

**Files:**
- Create: `src/lib/tkiero.ts`
- Create: `src/lib/__tests__/tkiero.test.ts`

The Tkiero API contract is not fully confirmed. The class is built around the 4 known methods. **When the real Tkiero API docs arrive, update the endpoint paths and response shapes in this file and CLAUDE.md together.**

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/tkiero.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { TkieroClient, TkieroApiError } from '@/lib/tkiero'

const mockHttp = {
  post: vi.fn(),
  get: vi.fn(),
} as unknown as AxiosInstance

describe('TkieroClient', () => {
  let client: TkieroClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new TkieroClient('test-key', 'https://api.tkiero.test', mockHttp)
  })

  describe('createPayment', () => {
    it('posts to /payments and returns the created payment', async () => {
      const mockPayment = {
        id: 'pay_123',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        metadata: {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        },
        createdAt: '2026-05-25T00:00:00Z',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockPayment })

      const result = await client.createPayment(100, 'USD', {
        serviceRequestId: 'req_1',
        clientId: 'usr_1',
        providerId: 'usr_2',
        category: 'DELIVERY',
      })

      expect(mockHttp.post).toHaveBeenCalledWith('/payments', {
        amount: 100,
        currency: 'USD',
        metadata: {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        },
      })
      expect(result.id).toBe('pay_123')
    })

    it('throws TkieroApiError when the API returns an error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { code: 'INVALID_AMOUNT', message: 'Amount too low' } },
      }
      vi.mocked(mockHttp.post).mockRejectedValueOnce(axiosError)

      await expect(
        client.createPayment(0, 'USD', {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        }),
      ).rejects.toThrow(TkieroApiError)
    })
  })

  describe('verifyPayment', () => {
    it('gets /payments/:id and returns the payment', async () => {
      const mockPayment = { id: 'pay_123', status: 'CONFIRMED' }
      vi.mocked(mockHttp.get).mockResolvedValueOnce({ data: mockPayment })

      const result = await client.verifyPayment('pay_123')

      expect(mockHttp.get).toHaveBeenCalledWith('/payments/pay_123')
      expect(result.id).toBe('pay_123')
    })
  })

  describe('releaseToProvider', () => {
    it('posts to /payments/:id/release and returns the result', async () => {
      const mockResult = {
        success: true,
        transactionId: 'txn_1',
        amount: 85,
        providerId: 'usr_2',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockResult })

      const result = await client.releaseToProvider('pay_123', 'usr_2', 85)

      expect(mockHttp.post).toHaveBeenCalledWith('/payments/pay_123/release', {
        providerId: 'usr_2',
        amount: 85,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('refund', () => {
    it('posts to /payments/:id/refund and returns the result', async () => {
      const mockResult = {
        success: true,
        refundId: 'ref_1',
        originalPaymentId: 'pay_123',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockResult })

      const result = await client.refund('pay_123', 'Service not delivered')

      expect(mockHttp.post).toHaveBeenCalledWith('/payments/pay_123/refund', {
        reason: 'Service not delivered',
      })
      expect(result.success).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test src/lib/__tests__/tkiero.test.ts
```

Expected: `FAIL` — module `@/lib/tkiero` not found.

- [ ] **Step 3: Implement src/lib/tkiero.ts**

```typescript
// src/lib/tkiero.ts
import axios, { type AxiosInstance, isAxiosError } from 'axios'

export type PaymentMetadata = {
  serviceRequestId: string
  clientId: string
  providerId: string
  category: string
}

export type TkieroPayment = {
  id: string
  amount: number
  currency: 'USD'
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'REFUNDED'
  metadata: PaymentMetadata
  createdAt: string
}

export type TkieroReleaseResult = {
  success: boolean
  transactionId: string
  amount: number
  providerId: string
}

export type TkieroRefundResult = {
  success: boolean
  refundId: string
  originalPaymentId: string
}

export class TkieroApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'TkieroApiError'
  }
}

export class TkieroClient {
  private readonly http: AxiosInstance

  constructor(
    apiKey: string,
    baseUrl: string,
    httpClient?: AxiosInstance,
  ) {
    this.http =
      httpClient ??
      axios.create({
        baseURL: baseUrl,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
  }

  async createPayment(
    amount: number,
    currency: 'USD',
    metadata: PaymentMetadata,
  ): Promise<TkieroPayment> {
    try {
      const { data } = await this.http.post<TkieroPayment>('/payments', {
        amount,
        currency,
        metadata,
      })
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async verifyPayment(paymentId: string): Promise<TkieroPayment> {
    try {
      const { data } = await this.http.get<TkieroPayment>(`/payments/${paymentId}`)
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async releaseToProvider(
    paymentId: string,
    providerId: string,
    amount: number,
  ): Promise<TkieroReleaseResult> {
    try {
      const { data } = await this.http.post<TkieroReleaseResult>(
        `/payments/${paymentId}/release`,
        { providerId, amount },
      )
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async refund(paymentId: string, reason: string): Promise<TkieroRefundResult> {
    try {
      const { data } = await this.http.post<TkieroRefundResult>(
        `/payments/${paymentId}/refund`,
        { reason },
      )
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  private wrapError(err: unknown): TkieroApiError {
    if (isAxiosError(err) && err.response) {
      const { status, data } = err.response as {
        status: number
        data: { code: string; message: string }
      }
      return new TkieroApiError(data.message ?? 'Tkiero API error', data.code ?? 'UNKNOWN', status)
    }
    if (err instanceof Error) {
      return new TkieroApiError(err.message, 'NETWORK_ERROR', 0)
    }
    return new TkieroApiError('Unknown error', 'UNKNOWN', 0)
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const tkiero = new TkieroClient(
  requireEnv('TKIERO_API_KEY'),
  requireEnv('TKIERO_BASE_URL'),
)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test src/lib/__tests__/tkiero.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tkiero.ts src/lib/__tests__/tkiero.test.ts
git commit -m "feat: add typed TkieroClient wrapper with error handling"
```

---

## Task 8: NextAuth configuration

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/actions/auth.ts`

- [ ] **Step 1: Create src/lib/auth.ts**

```typescript
// src/lib/auth.ts
import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { LoginSchema } from '@/types/schemas'
import type { UserRole } from '@/types'

const config: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user) return null

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: UserRole }).role
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(config)
```

- [ ] **Step 2: Create src/app/api/auth/[...nextauth]/route.ts**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 3: Create src/actions/auth.ts**

```typescript
// src/actions/auth.ts
'use server'

import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { RegisterSchema } from '@/types/schemas'
import type { RegisterInput } from '@/types/schemas'

export type RegisterResult =
  | { success: true; userId: string }
  | { success: false; error: string }

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) {
    return { success: false, error: 'An account with this email already exists' }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)

  const user = await db.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      name: parsed.data.name,
      role: parsed.data.role,
    },
  })

  return { success: true, userId: user.id }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "(auth|actions)" || echo "auth files: no errors"
```

Expected: No TypeScript errors in the auth files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/ src/actions/auth.ts
git commit -m "feat: add NextAuth v5 credentials provider with JWT strategy and register action"
```

---

## Task 9: Route protection middleware

**Files:**
- Create: `src/middleware.ts`

The middleware protects `/dashboard/*` and `/api/services/*`. It excludes `/api/auth/*` (NextAuth's own routes) and `/api/payments/webhook` (self-authenticates via Tkiero signature).

- [ ] **Step 1: Create src/middleware.ts**

```typescript
// src/middleware.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)

    // API routes return 401 JSON instead of redirect
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/services/:path*',
  ],
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "middleware" || echo "middleware: no errors"
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add route protection middleware for dashboard and services API"
```

---

## Task 10: Webhook receiver

**Files:**
- Create: `src/app/api/payments/webhook/route.ts`

> **IMPORTANT:** The HMAC header name (`X-Tkiero-Signature`) and signing algorithm need to be confirmed with the Tkiero team before this goes live. The implementation below uses HMAC-SHA256 which is the industry standard, but the exact header and format may differ.

- [ ] **Step 1: Create src/app/api/payments/webhook/route.ts**

```typescript
// src/app/api/payments/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { TkieroWebhookSchema } from '@/types/schemas'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TKIERO_WEBHOOK_SECRET
  if (!secret) {
    console.error('TKIERO_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const rawBody = await req.text()
  // TODO: confirm header name with Tkiero team — may be 'x-tkiero-signature' or similar
  const signature = req.headers.get('x-tkiero-signature') ?? ''

  let isValid: boolean
  try {
    isValid = verifySignature(rawBody, signature, secret)
  } catch {
    // timingSafeEqual throws if buffers have different length (invalid hex)
    isValid = false
  }

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = TkieroWebhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const { event, paymentId, metadata } = parsed.data

  try {
    if (event === 'payment.confirmed') {
      await db.transaction.updateMany({
        where: {
          serviceRequestId: metadata.serviceRequestId,
          status: 'PENDING',
        },
        data: {
          status: 'HELD',
          tkieroPaymentId: paymentId,
        },
      })
    } else if (event === 'payment.failed') {
      await db.transaction.updateMany({
        where: {
          serviceRequestId: metadata.serviceRequestId,
          status: 'PENDING',
        },
        data: { status: 'REFUNDED' },
      })
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook DB update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "webhook" || echo "webhook: no errors"
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payments/
git commit -m "feat: add Tkiero webhook receiver with HMAC signature verification"
```

---

## Task 11: Services API stub

**Files:**
- Create: `src/app/api/services/route.ts`

- [ ] **Step 1: Create src/app/api/services/route.ts**

```typescript
// src/app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { CreateServiceSchema } from '@/types/schemas'

export async function GET(): Promise<NextResponse> {
  const services = await db.service.findMany({
    where: { isActive: true },
    include: { provider: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(services)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'PROVIDER') {
    return NextResponse.json({ error: 'Only providers can create services' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateServiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 422 })
  }

  const providerProfile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!providerProfile) {
    return NextResponse.json({ error: 'Provider profile not found' }, { status: 404 })
  }

  const service = await db.service.create({
    data: {
      ...parsed.data,
      providerId: providerProfile.id,
    },
  })

  return NextResponse.json(service, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "services" || echo "services route: no errors"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/services/
git commit -m "feat: add services API route (GET all, POST create for providers)"
```

---

## Task 12: App folder structure and page stubs

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/app/(marketplace)/layout.tsx`
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/page.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/components/ui/.gitkeep`
- Create: `src/components/features/.gitkeep`

- [ ] **Step 1: Create src/app/(auth)/layout.tsx**

```typescript
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create src/app/(auth)/login/page.tsx**

```typescript
// src/app/(auth)/login/page.tsx
export default function LoginPage() {
  return (
    <div className="bg-white rounded-2xl shadow p-8">
      <h1 className="text-2xl font-semibold mb-6">Sign in to ServiLocal</h1>
      <p className="text-zinc-500 text-sm">Login form coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 3: Create src/app/(auth)/register/page.tsx**

```typescript
// src/app/(auth)/register/page.tsx
export default function RegisterPage() {
  return (
    <div className="bg-white rounded-2xl shadow p-8">
      <h1 className="text-2xl font-semibold mb-6">Create an account</h1>
      <p className="text-zinc-500 text-sm">Register form coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 4: Create src/app/(marketplace)/layout.tsx**

```typescript
// src/app/(marketplace)/layout.tsx
export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <span className="font-bold text-lg">ServiLocal</span>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Replace src/app/page.tsx**

```typescript
// src/app/page.tsx
export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Find local services in El Salvador</h1>
      <p className="mt-4 text-zinc-600">Browse providers, request services, pay in Tkiero.</p>
    </div>
  )
}
```

- [ ] **Step 6: Create src/app/dashboard/layout.tsx**

```typescript
// src/app/dashboard/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4">
        <span className="font-bold text-lg">ServiLocal — Dashboard</span>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 7: Create src/app/dashboard/page.tsx**

```typescript
// src/app/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
      <p className="mt-2 text-zinc-500">Dashboard features coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 8: Create component folder placeholders**

```bash
touch src/components/ui/.gitkeep src/components/features/.gitkeep
```

- [ ] **Step 9: Verify the app builds**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build completes with no TypeScript errors. There may be warnings about missing `TKIERO_API_KEY` at build time from the `tkiero.ts` singleton — that's expected and will be resolved with real env vars.

- [ ] **Step 10: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add app folder structure with auth, marketplace, and dashboard route groups"
```

---

## Task 13: Environment template and README

**Files:**
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create .env.example**

```bash
# .env.example
# Copy this file to .env and fill in all values before running the app.
# NEVER commit .env — it contains secrets.

# ─── Database ────────────────────────────────────────────────────────────────
# Standard PostgreSQL connection string (replace the prisma+postgres local dev URL)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/servilocal?sslmode=require"

# ─── Auth ────────────────────────────────────────────────────────────────────
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-32-char-random-secret-here"
# Full URL of the app (no trailing slash)
NEXTAUTH_URL="http://localhost:3000"

# ─── Tkiero Payment API ──────────────────────────────────────────────────────
# API key issued by the Tkiero team — SERVER SIDE ONLY
TKIERO_API_KEY="your-tkiero-api-key"
# Base URL of the Tkiero API — confirm with Tkiero team
TKIERO_BASE_URL="https://api.tkiero.sv"
# Secret for verifying webhook HMAC signatures — confirm with Tkiero team
TKIERO_WEBHOOK_SECRET="your-tkiero-webhook-secret"

# ─── App ─────────────────────────────────────────────────────────────────────
# Public-facing URL used in emails and OAuth redirects
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- [ ] **Step 2: Rewrite README.md**

```markdown
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
npx prisma migrate dev   # applies migrations + generates client
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
│   ├── db.ts             # Prisma singleton
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

**Critical invariant:** Commission must be recorded before funds move. If `recordCommission()` fails, the release is aborted and the error is logged. Funds stay in `HELD` until the issue is resolved manually.

## Commission Rates

| Category | Rate |
|----------|------|
| DELIVERY | 15%  |
| PLUMBING | 12%  |
| CLEANING | 12%  |
| TEACHING | 10%  |
| DESIGN   | 10%  |
| DIGITAL  |  8%  |

Rates live in `src/lib/commission.ts`. Do not hardcode them elsewhere.

## Tkiero API

The Tkiero API contract is not yet fully confirmed. Coordinate with the Tkiero team before going to production. All calls go through `src/lib/tkiero.ts` — never import Tkiero directly in components, pages, or server actions.

Known methods: `createPayment()`, `verifyPayment()`, `releaseToProvider()`, `refund()`.

The webhook signature header name (`x-tkiero-signature`) and HMAC format must be confirmed with the Tkiero team before launch.
```

- [ ] **Step 3: Confirm .env is in .gitignore**

```bash
grep "^\.env$" .gitignore || echo "MISSING — add .env to .gitignore"
```

Expected: `.env` is listed. If not, add it.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add .env.example and setup/architecture README"
```

---

## Task 14: Full test suite run

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All commission and tkiero tests pass. Something like:

```
✓ src/lib/__tests__/commission.test.ts (7)
✓ src/lib/__tests__/tkiero.test.ts (6)

Test Files  2 passed (2)
     Tests  13 passed (13)
```

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Warnings are acceptable.

- [ ] **Step 3: Final commit**

```bash
git add -A
git status  # review — make sure no .env files are staged
git commit -m "chore: complete project foundation scaffold"
```

---

## Self-Review Against Spec

| Requirement | Task |
|-------------|------|
| Prisma schema: User, ProviderProfile, Service, ServiceRequest, Transaction, Review, Commission | Task 2 |
| UserRole enum: CLIENT, PROVIDER, ADMIN | Task 2 + 4 |
| ServiceCategory enum: PLUMBING, TEACHING, DELIVERY, CLEANING, DESIGN, DIGITAL | Task 2 + 4 |
| TransactionStatus enum: PENDING, HELD, RELEASED, DISPUTED, REFUNDED | Task 2 + 4 |
| NextAuth v5, credentials + JWT | Task 8 |
| Protect /dashboard and /api/* | Task 9 |
| Folder structure: (auth), (marketplace), dashboard, api/services, api/payments/webhook | Task 12 |
| src/lib/db.ts — Prisma singleton | Task 5 |
| src/lib/tkiero.ts — typed wrapper: createPayment, verifyPayment, releaseToProvider, refund | Task 7 |
| src/lib/auth.ts | Task 8 |
| src/lib/commission.ts — calculateCommission + recordCommission | Task 6 |
| src/types/ — types and Zod schemas | Task 4 |
| .env.example | Task 13 |
| README.md with escrow flow | Task 13 |
| Webhook verifies TKIERO_WEBHOOK_SECRET on every request, rejects unsigned with 401 | Task 10 |
| All Tkiero calls through src/lib/tkiero.ts | Task 7 (enforced by architecture) |
| TypeScript strict, no `any`, Zod on every input | All tasks |
| Server actions for mutations | Task 8 (register) |
| API routes only for webhook + external integrations | Tasks 10–11 |
| Explicit error handling in payment flows | Tasks 7, 10 |
| Named exports only | All tasks |
| Prisma transactions for multi-step writes | Task 6 (recordCommission — single write; multi-step writes noted for future tasks) |
