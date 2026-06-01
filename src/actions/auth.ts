'use server'

import bcrypt from 'bcryptjs'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { LoginSchema, RegisterSchema } from '@/types/schemas'
import type { RegisterInput } from '@/types/schemas'

function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw) return '/'
  try {
    const { pathname } = new URL(raw)
    return /^\/(?!\/)/.test(pathname) ? pathname : '/'
  } catch {
    return /^\/(?!\/)/.test(raw) ? raw : '/'
  }
}

export type AuthState = {
  fieldErrors?: {
    email?: string
    password?: string
    name?: string
    phone?: string
    skills?: string
  }
  error?: string
}

export type RegisterResult =
  | { success: true; userId: string }
  | { success: false; code: 'EMAIL_EXISTS' | 'VALIDATION_ERROR' | 'UNKNOWN'; error: string }

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) {
    return { success: false, code: 'EMAIL_EXISTS', error: 'An account with this email already exists' }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)

  if (parsed.data.role === 'PROVIDER') {
    if (!parsed.data.skills || parsed.data.skills.length === 0) {
      return { success: false, code: 'VALIDATION_ERROR', error: 'Selecciona al menos una habilidad' }
    }
  }

  const skills = parsed.data.skills ?? []

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email:        parsed.data.email,
        passwordHash,
        name:         parsed.data.name,
        phone:        parsed.data.phone,
        role:         parsed.data.role,
      },
    })
    if (parsed.data.role === 'PROVIDER') {
      await tx.providerProfile.create({
        data: { userId: created.id, skills },
      })
    }
    return created
  })

  return { success: true, userId: user.id }
}

export async function login(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations('Auth')

  const raw = {
    email: (formData.get('email') ?? '') as string,
    password: (formData.get('password') ?? '') as string,
  }

  const parsed = LoginSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: NonNullable<AuthState['fieldErrors']> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'email') fieldErrors.email = t('errors.invalidEmail')
      else if (field === 'password') fieldErrors.password = t('errors.passwordTooShort')
    }
    return { fieldErrors }
  }

  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl') as string | null)

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
          return { error: t('errors.INVALID_CREDENTIALS') }
        default:
          return { error: t('errors.UNKNOWN') }
      }
    }
    throw error
  }

  return {}
}

export async function registerAndLogin(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations('Auth')

  const skillsRaw = formData.getAll('skills').filter((v): v is string => typeof v === 'string')

  const raw = {
    email:    (formData.get('email')    ?? '') as string,
    password: (formData.get('password') ?? '') as string,
    name:     (formData.get('name')     ?? '') as string,
    role:     (formData.get('role')     ?? '') as string,
    phone:    (formData.get('phone')    ?? '') as string,
    skills:   skillsRaw,
  }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: NonNullable<AuthState['fieldErrors']> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'email')    fieldErrors.email    = t('errors.invalidEmail')
      else if (field === 'password') fieldErrors.password = t('errors.passwordTooShort')
      else if (field === 'name')     fieldErrors.name     = t('errors.nameTooShort')
      else if (field === 'phone')    fieldErrors.phone    = 'Número de teléfono inválido'
    }
    return { fieldErrors }
  }

  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl') as string | null)

  const result = await register(parsed.data)
  if (!result.success) {
    if (result.code === 'EMAIL_EXISTS') {
      return { fieldErrors: { email: t('errors.EMAIL_EXISTS') } }
    }
    if (result.code === 'VALIDATION_ERROR' && result.error.includes('habilidad')) {
      return { fieldErrors: { skills: result.error } }
    }
    return { error: t('errors.UNKNOWN') }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: t('errors.SIGNUP_SIGNIN_FAILED') }
    }
    throw error
  }

  return {}
}
