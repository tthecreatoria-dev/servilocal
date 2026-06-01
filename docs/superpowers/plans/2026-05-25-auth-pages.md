# Auth Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub login and register pages with fully functional forms wired to the existing NextAuth v5 + server actions infrastructure.

**Architecture:** Both pages are server components that read `searchParams` and pass `callbackUrl` to inner client-form components. The client forms use `useActionState` bound to server actions. Login wraps `signIn('credentials')` and re-throws redirects; register runs Zod validation, calls the existing `register()`, then auto-logs in via `signIn()`.

**Tech Stack:** Next.js 15 App Router, React 19 `useActionState` / `useFormStatus`, NextAuth v5, Zod, Vitest for server action unit tests.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/actions/auth.ts` | Modify | Add `AuthState` type, `login()`, `registerAndLogin()` |
| `src/actions/__tests__/auth.test.ts` | Create | Unit tests for `login()` and `registerAndLogin()` |
| `src/components/ui/submit-button.tsx` | Create | Pending-aware submit button using `useFormStatus` |
| `src/app/(auth)/login/page.tsx` | Modify | Server component — reads `searchParams`, renders `<LoginForm>` |
| `src/app/(auth)/login/login-form.tsx` | Create | Client form — `useActionState(login, null)` |
| `src/app/(auth)/register/page.tsx` | Modify | Server component — reads `searchParams`, renders `<RegisterForm>` |
| `src/app/(auth)/register/register-form.tsx` | Create | Client form — role toggle + `useActionState(registerAndLogin, null)` |

---

## Task 1: AuthState type + login() server action

**Files:**
- Modify: `src/actions/auth.ts`
- Create: `src/actions/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/__tests__/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mocks before any imports
const mockSignIn = vi.hoisted(() => vi.fn())
const mockFindUnique = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const MockAuthError = vi.hoisted(() => {
  class AuthErrorMock extends Error {
    type: string = 'AuthError'
  }
  return AuthErrorMock
})

vi.mock('next-auth', () => ({ AuthError: MockAuthError }))
vi.mock('@/lib/auth', () => ({ signIn: mockSignIn }))
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: mockFindUnique, create: mockCreate } },
}))

import { login } from '@/actions/auth'
import type { AuthState } from '@/actions/auth'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

describe('login()', () => {
  beforeEach(() => {
    mockSignIn.mockClear()
    mockFindUnique.mockClear()
    mockCreate.mockClear()
  })

  it('returns fieldErrors.email when email is invalid', async () => {
    const fd = makeFormData({ email: 'not-an-email', password: 'password123' })
    const result = await login(null, fd)
    expect(result.fieldErrors?.email).toMatch(/invalid email/i)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.password when password is too short', async () => {
    const fd = makeFormData({ email: 'user@example.com', password: 'short' })
    const result = await login(null, fd)
    expect(result.fieldErrors?.password).toMatch(/at least 8/i)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('returns error banner for CredentialsSignin', async () => {
    const err = new MockAuthError()
    err.type = 'CredentialsSignin'
    mockSignIn.mockRejectedValueOnce(err)

    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    const result = await login(null, fd)
    expect(result.error).toBe('Invalid email or password')
  })

  it('returns generic error for other AuthError types', async () => {
    const err = new MockAuthError()
    err.type = 'OAuthSignin'
    mockSignIn.mockRejectedValueOnce(err)

    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    const result = await login(null, fd)
    expect(result.error).toBe('Something went wrong. Please try again.')
  })

  it('re-throws non-AuthError errors (e.g. NEXT_REDIRECT)', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mockSignIn.mockRejectedValueOnce(redirect)

    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    await expect(login(null, fd)).rejects.toThrow('NEXT_REDIRECT')
  })

  it('passes callbackUrl to signIn', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      callbackUrl: '/dashboard',
    })
    await login(null, fd)
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'user@example.com',
      password: 'password123',
      redirectTo: '/dashboard',
    })
  })

  it('defaults redirectTo "/" when callbackUrl is absent', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    await login(null, fd)
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest run src/actions/__tests__/auth.test.ts
```

Expected: `Error: login is not exported from '@/actions/auth'` (or similar).

- [ ] **Step 3: Add AuthState type and login() to src/actions/auth.ts**

Replace the entire file with:

```ts
'use server'

import bcrypt from 'bcryptjs'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { db } from '@/lib/db'
import { LoginSchema, RegisterSchema } from '@/types/schemas'
import type { RegisterInput } from '@/types/schemas'

// ---- Shared state shape for useActionState forms ----

export type AuthState = {
  fieldErrors?: {
    email?: string
    password?: string
    name?: string
  }
  error?: string
}

// ---- Existing: register() ----

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

// ---- New: login() ----

export async function login(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = LoginSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: NonNullable<AuthState['fieldErrors']> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<AuthState['fieldErrors']>
      if (field) fieldErrors[field] = issue.message
    }
    return { fieldErrors }
  }

  const callbackUrl = (formData.get('callbackUrl') as string | null) ?? '/'

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' }
        default:
          return { error: 'Something went wrong. Please try again.' }
      }
    }
    throw error
  }

  return {}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/actions/__tests__/auth.test.ts
```

Expected: all `login()` tests pass (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/actions/auth.ts src/actions/__tests__/auth.test.ts
git commit -m "feat: add AuthState type and login() server action"
```

---

## Task 2: registerAndLogin() server action

**Files:**
- Modify: `src/actions/auth.ts` (add `registerAndLogin`)
- Modify: `src/actions/__tests__/auth.test.ts` (add `registerAndLogin()` describe block)

- [ ] **Step 1: Add registerAndLogin() tests to the test file**

First, update the existing import line near the top of `src/actions/__tests__/auth.test.ts`:

```ts
// Change this line:
import { login } from '@/actions/auth'
// To:
import { login, registerAndLogin } from '@/actions/auth'
```

Then append this describe block at the end of the file (after the closing `})` of the `login()` describe):

```ts
describe('registerAndLogin()', () => {
  beforeEach(() => {
    mockSignIn.mockClear()
    mockFindUnique.mockClear()
    mockCreate.mockClear()
  })

  it('returns fieldErrors.name when name is too short', async () => {
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      name: 'A',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.name).toMatch(/at least 2/i)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.email when email is invalid', async () => {
    const fd = makeFormData({
      email: 'not-an-email',
      password: 'password123',
      name: 'Valid Name',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.email).toMatch(/invalid email/i)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.password when password is too short', async () => {
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'short',
      name: 'Valid Name',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.password).toMatch(/at least 8/i)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.email when email is already registered', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'existing_user' })

    const fd = makeFormData({
      email: 'taken@example.com',
      password: 'password123',
      name: 'Valid Name',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.email).toMatch(/already exists/i)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('calls signIn with correct credentials on success and re-throws redirect', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    const redirect = new Error('NEXT_REDIRECT')
    mockSignIn.mockRejectedValueOnce(redirect)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'CLIENT',
      callbackUrl: '/dashboard',
    })

    await expect(registerAndLogin(null, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'new@example.com',
      password: 'password123',
      redirectTo: '/dashboard',
    })
  })

  it('defaults redirectTo "/" when callbackUrl is absent', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    mockSignIn.mockResolvedValueOnce(undefined)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'PROVIDER',
    })

    await registerAndLogin(null, fd)
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest run src/actions/__tests__/auth.test.ts
```

Expected: `registerAndLogin()` tests fail (`registerAndLogin is not exported`).

- [ ] **Step 3: Add registerAndLogin() to src/actions/auth.ts**

Append after the `login()` function:

```ts
// ---- New: registerAndLogin() ----

export async function registerAndLogin(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    name: formData.get('name') as string,
    role: formData.get('role') as string,
  }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: NonNullable<AuthState['fieldErrors']> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<AuthState['fieldErrors']>
      if (field) fieldErrors[field] = issue.message
    }
    return { fieldErrors }
  }

  const callbackUrl = (formData.get('callbackUrl') as string | null) ?? '/'

  const result = await register(parsed.data)
  if (!result.success) {
    if (result.error.includes('already exists')) {
      return { fieldErrors: { email: result.error } }
    }
    return { error: result.error }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Account created but sign-in failed. Please sign in manually.' }
    }
    throw error
  }

  return {}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/actions/__tests__/auth.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/auth.ts src/actions/__tests__/auth.test.ts
git commit -m "feat: add registerAndLogin() server action"
```

---

## Task 3: SubmitButton component

**Files:**
- Create: `src/components/ui/submit-button.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/submit-button.tsx
'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-press w-full bg-primary text-on-primary py-3 rounded-full text-label-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? 'Loading…' : label}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/submit-button.tsx
git commit -m "feat: add SubmitButton with useFormStatus pending state"
```

---

## Task 4: Login page

**Files:**
- Create: `src/app/(auth)/login/login-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create the LoginForm client component**

Create `src/app/(auth)/login/login-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { login } from '@/actions/auth'
import type { AuthState } from '@/actions/auth'
import { SubmitButton } from '@/components/ui/submit-button'

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<AuthState | null, FormData>(login, null)

  return (
    <div className="bg-white rounded-2xl shadow p-8">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-6">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          handshake
        </span>
        <span className="text-headline-md text-primary">ServiLocal</span>
      </div>

      <h1 className="text-headline-md text-on-surface mb-1">Sign in</h1>
      <p className="text-body-md text-on-surface-variant mb-6">
        Welcome back. Enter your credentials.
      </p>

      {state?.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-label-md mb-4">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <div>
          <label
            htmlFor="email"
            className="text-label-md text-on-surface-variant block mb-1"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest"
          />
          {state?.fieldErrors?.email && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-label-md text-on-surface-variant block mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest"
          />
          {state?.fieldErrors?.password && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.password}</p>
          )}
        </div>

        <SubmitButton label="Sign in" />
      </form>

      <p className="text-center text-body-md text-on-surface-variant mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary font-semibold hover:underline">
          Register
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Replace the login page stub**

Replace the entire contents of `src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  return <LoginForm callbackUrl={callbackUrl ?? ''} />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx src/app/\(auth\)/login/login-form.tsx
git commit -m "feat: implement login page with useActionState form"
```

---

## Task 5: Register page

**Files:**
- Create: `src/app/(auth)/register/register-form.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Create the RegisterForm client component**

Create `src/app/(auth)/register/register-form.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { registerAndLogin } from '@/actions/auth'
import type { AuthState } from '@/actions/auth'
import { SubmitButton } from '@/components/ui/submit-button'

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<AuthState | null, FormData>(
    registerAndLogin,
    null,
  )
  const [role, setRole] = useState<'CLIENT' | 'PROVIDER'>('CLIENT')

  return (
    <div className="bg-white rounded-2xl shadow p-8">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-6">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          handshake
        </span>
        <span className="text-headline-md text-primary">ServiLocal</span>
      </div>

      <h1 className="text-headline-md text-on-surface mb-1">Create account</h1>
      <p className="text-body-md text-on-surface-variant mb-6">
        Join ServiLocal — hire or offer services.
      </p>

      {state?.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-label-md mb-4">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="role" value={role} />

        {/* Role toggle */}
        <div>
          <label className="text-label-md text-on-surface-variant block mb-2">
            I want to…
          </label>
          <div className="flex bg-surface-container rounded-full p-1 gap-1">
            <button
              type="button"
              onClick={() => setRole('CLIENT')}
              className={`flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
                role === 'CLIENT'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              🔍 Hire (Client)
            </button>
            <button
              type="button"
              onClick={() => setRole('PROVIDER')}
              className={`flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
                role === 'PROVIDER'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              🔧 Work (Provider)
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="text-label-md text-on-surface-variant block mb-1"
          >
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest"
          />
          {state?.fieldErrors?.name && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.name}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="text-label-md text-on-surface-variant block mb-1"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest"
          />
          {state?.fieldErrors?.email && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.email}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="text-label-md text-on-surface-variant block mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest"
          />
          {state?.fieldErrors?.password && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.password}</p>
          )}
        </div>

        <SubmitButton label="Create account" />
      </form>

      <p className="text-center text-body-md text-on-surface-variant mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Replace the register page stub**

Replace the entire contents of `src/app/(auth)/register/page.tsx`:

```tsx
import { RegisterForm } from './register-form'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  return <RegisterForm callbackUrl={callbackUrl ?? ''} />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/register/page.tsx src/app/\(auth\)/register/register-form.tsx
git commit -m "feat: implement register page with role toggle and useActionState form"
```

---

## Task 6: Full test suite + manual smoke test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass (including commission and tkiero tests unchanged).

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Test login page at http://localhost:3000/login**

Check each of these manually:
1. Submit empty form — browser native validation fires (required fields)
2. Enter `bad-email` + `short` → submit → field errors appear under email and password
3. Enter valid email + correct password for a seeded user → redirects to `/`
4. Enter valid email + wrong password → red banner "Invalid email or password" appears

- [ ] **Step 4: Test register page at http://localhost:3000/register**

Check each of these manually:
1. Toggle pill switches between "Hire (Client)" and "Work (Provider)" — active side highlights orange
2. Submit empty form — browser native validation fires
3. Enter single-char name + submit → field error under name
4. Enter an email already in the DB → field error under email ("already exists")
5. Fill all fields correctly as CLIENT → creates account, auto-logs in, redirects to `/`
6. Visit `/login` after logging out → form shows, login works

- [ ] **Step 5: Test that protected routes redirect to /login with callbackUrl**

Visit `http://localhost:3000/dashboard` while logged out. Should redirect to `/login?callbackUrl=%2Fdashboard`. After logging in, should land on `/dashboard`.
