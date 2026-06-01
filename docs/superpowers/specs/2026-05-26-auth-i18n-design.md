# Auth Pages i18n Design

**Date:** 2026-05-26
**Scope:** Login and register pages — Spanish default, English toggle

---

## Context

`next-intl` is already installed and configured with cookie-based locale switching (`NEXT_LOCALE` cookie). The default locale is `es`. Message files `messages/es.json` and `messages/en.json` exist and cover Header, Footer, BottomNav, and HomePage. The auth pages (`login-form.tsx`, `register-form.tsx`) are still hardcoded in English and have not been wired to the i18n system.

---

## Goals

- Auth pages render in Spanish by default
- All visible text is translated: headings, labels, buttons, links, and error messages
- A page-level language toggle (text-only "Español / English") lets users switch languages
- The selected language persists via the existing `NEXT_LOCALE` cookie

---

## Out of scope

- URL-based locale routing (`/es/login`, `/en/login`)
- Browser language auto-detection
- i18n for any pages outside the auth group

---

## Section 1 — Translation keys

A new `Auth` namespace is added to both `messages/es.json` and `messages/en.json`.

### Key structure

```
Auth
├── login
│   ├── title           "Iniciar sesión" / "Sign in"
│   ├── subtitle        "Bienvenido de vuelta. Ingresa tus credenciales." / "Welcome back. Enter your credentials."
│   ├── button          "Iniciar sesión" / "Sign in"
│   ├── noAccount       "¿No tienes cuenta?" / "Don't have an account?"
│   └── registerLink    "Regístrate" / "Register"
├── register
│   ├── title           "Crear cuenta" / "Create account"
│   ├── subtitle        "Únete a ServiLocal — contrata u ofrece servicios." / "Join ServiLocal — hire or offer services."
│   ├── button          "Crear cuenta" / "Create account"
│   ├── roleLabel       "Quiero…" / "I want to…"
│   ├── roleClient      "🔍 Contratar (Cliente)" / "🔍 Hire (Client)"
│   ├── roleProvider    "🔧 Trabajar (Proveedor)" / "🔧 Work (Provider)"
│   ├── haveAccount     "¿Ya tienes cuenta?" / "Already have an account?"
│   └── loginLink       "Iniciar sesión" / "Sign in"
├── fields
│   ├── email           "Correo electrónico" / "Email"
│   ├── password        "Contraseña" / "Password"
│   └── fullName        "Nombre completo" / "Full name"
└── errors
    ├── invalidEmail          "Correo electrónico inválido" / "Invalid email address"
    ├── passwordTooShort      "La contraseña debe tener al menos 8 caracteres" / "Password must be at least 8 characters"
    ├── nameTooShort          "El nombre debe tener al menos 2 caracteres" / "Name must be at least 2 characters"
    ├── INVALID_CREDENTIALS   "Correo o contraseña incorrectos" / "Invalid email or password"
    ├── EMAIL_EXISTS          "Ya existe una cuenta con este correo" / "An account with this email already exists"
    ├── SIGNUP_SIGNIN_FAILED  "Cuenta creada, pero no se pudo iniciar sesión. Por favor inicia sesión manualmente." / "Account created but sign-in failed. Please sign in manually."
    └── UNKNOWN               "Algo salió mal. Intenta de nuevo." / "Something went wrong. Please try again."
```

---

## Section 2 — Server action changes

**File:** `src/actions/auth.ts`

`AuthState` shape is unchanged — `error` and `fieldErrors` remain `string` typed. Errors are translated server-side before being returned, so the client receives pre-translated strings with no additional mapping needed.

### Changes

1. Import `getTranslations` from `next-intl/server` at the top of the file.
2. In `login()`: add `const t = await getTranslations('Auth')` as the first line. Replace all hardcoded error strings:
   - `'Invalid email or password'` → `t('errors.INVALID_CREDENTIALS')`
   - `'Something went wrong. Please try again.'` → `t('errors.UNKNOWN')`
   - Zod field errors: map on `issue.path[0]` instead of using `issue.message`:
     - `email` → `t('errors.invalidEmail')`
     - `password` → `t('errors.passwordTooShort')`
3. In `registerAndLogin()`: same `getTranslations` call. The current code forwards `result.error` (an English string from `register()`) directly into `AuthState`. Replace both usages of `result.error` with translated calls keyed on `result.code`:
   - `result.code === 'EMAIL_EXISTS'` branch: `return { fieldErrors: { email: t('errors.EMAIL_EXISTS') } }`
   - General failure branch: `return { error: t('errors.UNKNOWN') }`
   - Sign-in-after-register failure: `return { error: t('errors.SIGNUP_SIGNIN_FAILED') }`
   - Zod field errors mapped same as login, plus `name` → `t('errors.nameTooShort')`
4. In `register()`: this function is an internal helper — its `error` string is now ignored by `registerAndLogin()` in favour of `t(...)` calls keyed on `result.code`. No change needed in `register()` itself.

---

## Section 3 — Language toggle

### `src/actions/locale.ts` (new file)

A single server action:

```ts
'use server'
import { cookies } from 'next/headers'
import { locales, type Locale } from '@/i18n/request'

export async function setLocale(locale: Locale) {
  const store = await cookies()
  store.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
}
```

### `src/components/ui/language-toggle.tsx` (new file)

Client component. Reads the current locale from `next-intl` (`useLocale()`). Renders two text buttons: `Español` and `English`. The active language is visually distinguished (font-semibold, text-on-surface vs text-on-surface-variant). On click, calls `setLocale` then `router.refresh()`.

### `src/app/(auth)/layout.tsx` (update)

- Add `'use client'` — no, keep it as a server component. Import `LanguageToggle` directly (it is a client component so it can be imported into a server component).
- Wrap the outer `div` in `relative` and add `<LanguageToggle />` at `absolute top-4 right-4`.

---

## Section 4 — Form component updates

**Files:** `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/register/register-form.tsx`

Both are already `'use client'` components. Changes:

1. Import `useTranslations` from `next-intl`.
2. Add `const t = useTranslations('Auth')` inside the component body.
3. Replace every hardcoded string with the corresponding `t(...)` call per the key structure in Section 1.
4. No structural changes to the JSX or form logic.

---

## Files changed

| File | Change |
|---|---|
| `messages/es.json` | Add `Auth` namespace |
| `messages/en.json` | Add `Auth` namespace |
| `src/actions/auth.ts` | Use `getTranslations` for all error strings |
| `src/actions/locale.ts` | New — `setLocale` server action |
| `src/components/ui/language-toggle.tsx` | New — text toggle component |
| `src/app/(auth)/layout.tsx` | Mount `LanguageToggle` top-right |
| `src/app/(auth)/login/login-form.tsx` | Add `useTranslations`, replace strings |
| `src/app/(auth)/register/register-form.tsx` | Add `useTranslations`, replace strings |
