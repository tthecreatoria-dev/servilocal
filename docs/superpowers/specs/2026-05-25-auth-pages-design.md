# Auth Pages Design — Login & Register

**Date:** 2026-05-25  
**Scope:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/actions/auth.ts`

---

## Overview

Replace the stub login and register pages with fully functional auth forms wired to the existing NextAuth v5 + server actions infrastructure. Both pages use React 19's `useActionState` pattern — no new API routes.

---

## Decisions

| Topic | Decision |
|---|---|
| Role selection (register) | Toggle pill above the form: "Hire (Client)" / "Work (Provider)" — CLIENT selected by default |
| Post-register redirect | Auto-login via `signIn()` then redirect to `callbackUrl` or `/` |
| Error display | Field-level errors for validation failures + top red banner for auth/server errors |
| Form pattern | `useActionState` + server actions (approach A) |

---

## Architecture

### New server actions (`src/actions/auth.ts`)

Two new exports added alongside the existing `register()`:

**`login(prevState, formData)`**

```ts
// Wraps NextAuth signIn('credentials'). On AuthError → returns error state.
// On success → throws NEXT_REDIRECT (re-throw so Next.js handles navigation).
// callbackUrl comes from a hidden input populated by searchParams on the page.
```

- Validates email/password with `LoginSchema` before calling `signIn`
- Catches `AuthError`: `CredentialsSignin` → `"Invalid email or password"`, default → `"Something went wrong"`
- Re-throws non-`AuthError` errors (including the redirect) so Next.js handles them
- Returns `{ fieldErrors?: Record<string, string>; error?: string }` on failure

**`registerAndLogin(prevState, formData)`**

```ts
// 1. Parse FormData and run RegisterSchema.safeParse() for field-level errors.
// 2. Call register() (existing action) — also validates, safe to call twice.
// 3. On "email already exists" → { fieldErrors: { email: '...' } }.
// 4. On success → signIn() throws redirect, which is re-thrown.
```

- Parses `formData` and runs `RegisterSchema.safeParse()` first — returns `fieldErrors` from Zod issues
- If valid, calls `register()`:
  - `"An account with this email already exists"` → `{ fieldErrors: { email: '...' } }`
  - Other errors → `{ error: '...' }` (top banner)
- On `{ success: true }` → calls `signIn('credentials', { email, password, redirectTo: callbackUrl ?? '/' })`

### State shape (shared)

```ts
type AuthState = {
  fieldErrors?: { email?: string; password?: string; name?: string }
  error?: string   // top banner: auth failure or server error
}
```

---

## Pages

### Login — `src/app/(auth)/login/page.tsx`

- Server component wrapper `await`s `searchParams` (Next.js 15 async) and reads `.callbackUrl`
- Inner `<LoginForm callbackUrl={...} />` is a client component using `useActionState(login, null)`
- Fields: email, password
- Hidden input: `callbackUrl`
- Error banner: shown when `state.error` is set (red, top of form)
- Field errors: shown below each input when `state.fieldErrors.<field>` is set
- Footer: "Don't have an account? Register" → links to `/register`
- Submit button uses `useFormStatus` for pending/disabled state

### Register — `src/app/(auth)/register/page.tsx`

- Server component wrapper `await`s `searchParams` (Next.js 15 async) and reads `.callbackUrl`
- Inner `<RegisterForm callbackUrl={...} />` client component using `useActionState(registerAndLogin, null)`
- Role toggle pill: two buttons toggling a hidden `role` input between `CLIENT` and `PROVIDER` (CLIENT default)
- Fields: name, email, password
- Hidden input: `callbackUrl`
- Error banner: shown when `state.error` is set
- Field errors: shown below each input
- Footer: "Already have an account? Sign in" → links to `/login`

### Shared `<SubmitButton>` component

Lives in `src/components/ui/submit-button.tsx`. Uses `useFormStatus` — shows spinner + "Loading…" text while pending, disabled during submission. Accepts `label` prop.

---

## Visual Design

Follows the existing brand tokens from `globals.css`:

- Card shell: existing `bg-white rounded-2xl shadow p-8` from `(auth)/layout.tsx`
- Primary orange: `text-primary`, `bg-primary`, `border-outline`
- Inputs: `border border-outline rounded-xl px-4 py-3` with `focus:border-primary focus:ring-0` 
- Error banner: `bg-red-50 border border-red-200 text-red-700 rounded-xl p-3`
- Field error text: `text-red-600 text-label-sm mt-1`
- Role toggle: `bg-surface-container rounded-full p-1` pill with active side `bg-primary text-on-primary`
- Submit button: `bg-primary text-on-primary rounded-full px-6 py-3 text-label-md btn-press w-full`
- Logo row: Material Symbols `handshake` icon + "ServiLocal" in `text-headline-md text-primary`

---

## What is NOT in scope

- OAuth providers (Google, GitHub) — not in the Tkiero stack
- "Forgot password" flow — not requested
- Email verification — not requested
- ADMIN role registration — admins created via DB seed only

---

## Files touched

| File | Change |
|---|---|
| `src/actions/auth.ts` | Add `login()` and `registerAndLogin()` exports |
| `src/app/(auth)/login/page.tsx` | Replace stub with server component + `<LoginForm>` |
| `src/app/(auth)/register/page.tsx` | Replace stub with server component + `<RegisterForm>` |
| `src/components/ui/submit-button.tsx` | New — shared pending-aware submit button |
