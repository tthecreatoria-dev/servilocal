import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSignIn = vi.hoisted(() => vi.fn())
const mockFindUnique = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockGetTranslations = vi.hoisted(() => vi.fn())
const MockAuthError = vi.hoisted(() => {
  class AuthErrorMock extends Error {
    type: string = 'AuthError'
  }
  return AuthErrorMock
})

vi.mock('next-auth', () => ({ AuthError: MockAuthError }))
vi.mock('@/lib/auth', () => ({ signIn: mockSignIn }))
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: mockFindUnique, create: mockCreate }, $transaction: mockTransaction },
}))
vi.mock('next-intl/server', () => ({ getTranslations: mockGetTranslations }))

import { login, registerAndLogin } from '@/actions/auth'

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
    mockGetTranslations.mockResolvedValue((key: string) => key)
  })

  it('returns fieldErrors.email with translation key when email is invalid', async () => {
    const fd = makeFormData({ email: 'not-an-email', password: 'password123' })
    const result = await login(null, fd)
    expect(result.fieldErrors?.email).toBe('errors.invalidEmail')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.password with translation key when password is too short', async () => {
    const fd = makeFormData({ email: 'user@example.com', password: 'short' })
    const result = await login(null, fd)
    expect(result.fieldErrors?.password).toBe('errors.passwordTooShort')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('returns INVALID_CREDENTIALS key for CredentialsSignin error', async () => {
    const err = new MockAuthError()
    err.type = 'CredentialsSignin'
    mockSignIn.mockRejectedValueOnce(err)

    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    const result = await login(null, fd)
    expect(result.error).toBe('errors.INVALID_CREDENTIALS')
  })

  it('returns UNKNOWN key for other AuthError types', async () => {
    const err = new MockAuthError()
    err.type = 'OAuthSignin'
    mockSignIn.mockRejectedValueOnce(err)

    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    const result = await login(null, fd)
    expect(result.error).toBe('errors.UNKNOWN')
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

  it('defaults redirectTo "/" for protocol-relative callbackUrl (open redirect guard)', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      callbackUrl: '//evil.com',
    })
    await login(null, fd)
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })

  it('defaults redirectTo "/" when callbackUrl is absent', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const fd = makeFormData({ email: 'user@example.com', password: 'password123' })
    const result = await login(null, fd)
    expect(result).toEqual({})
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })

  it('extracts pathname from absolute callbackUrl (middleware redirect pattern)', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      callbackUrl: 'http://localhost:3000/dashboard',
    })
    await login(null, fd)
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/dashboard' }),
    )
  })
})

describe('registerAndLogin()', () => {
  beforeEach(() => {
    mockSignIn.mockClear()
    mockFindUnique.mockClear()
    mockCreate.mockClear()
    mockTransaction.mockClear()
    mockGetTranslations.mockResolvedValue((key: string) => key)
  })

  it('returns fieldErrors.name with translation key when name is too short', async () => {
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      name: 'A',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.name).toBe('errors.nameTooShort')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.email with translation key when email is invalid', async () => {
    const fd = makeFormData({
      email: 'not-an-email',
      password: 'password123',
      name: 'Valid Name',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.email).toBe('errors.invalidEmail')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns fieldErrors.password with translation key when password is too short', async () => {
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'short',
      name: 'Valid Name',
      role: 'CLIENT',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.password).toBe('errors.passwordTooShort')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns EMAIL_EXISTS key in fieldErrors.email when email is taken', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'existing_user' })

    const fd = makeFormData({
      email: 'taken@example.com',
      password: 'password123',
      name: 'Valid Name',
      role: 'CLIENT',
      phone: '12345678',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors?.email).toBe('errors.EMAIL_EXISTS')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('calls signIn with correct credentials on success and re-throws redirect', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockTransaction.mockImplementationOnce(async (fn: (tx: { user: { create: typeof mockCreate }; providerProfile: { create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) =>
      fn({ user: { create: mockCreate }, providerProfile: { create: vi.fn().mockResolvedValue({}) } }),
    )
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    const redirect = new Error('NEXT_REDIRECT')
    mockSignIn.mockRejectedValueOnce(redirect)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'CLIENT',
      phone: '12345678',
      callbackUrl: '/dashboard',
    })

    await expect(registerAndLogin(null, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'new@example.com',
      password: 'password123',
      redirectTo: '/dashboard',
    })
  })

  it('returns SIGNUP_SIGNIN_FAILED key when sign-in after register throws AuthError', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockTransaction.mockImplementationOnce(async (fn: (tx: { user: { create: typeof mockCreate }; providerProfile: { create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) =>
      fn({ user: { create: mockCreate }, providerProfile: { create: vi.fn().mockResolvedValue({}) } }),
    )
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    const err = new MockAuthError()
    err.type = 'CredentialsSignin'
    mockSignIn.mockRejectedValueOnce(err)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'CLIENT',
      phone: '12345678',
    })

    const result = await registerAndLogin(null, fd)
    expect(result.error).toBe('errors.SIGNUP_SIGNIN_FAILED')
  })

  it('defaults redirectTo "/" when callbackUrl is absent', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockTransaction.mockImplementationOnce(async (fn: (tx: { user: { create: typeof mockCreate }; providerProfile: { create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) =>
      fn({ user: { create: mockCreate }, providerProfile: { create: vi.fn().mockResolvedValue({}) } }),
    )
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    mockSignIn.mockResolvedValueOnce(undefined)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'CLIENT',
      phone: '12345678',
    })

    const result = await registerAndLogin(null, fd)
    expect(result).toEqual({})
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })

  it('extracts pathname from absolute callbackUrl', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockTransaction.mockImplementationOnce(async (fn: (tx: { user: { create: typeof mockCreate }; providerProfile: { create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) =>
      fn({ user: { create: mockCreate }, providerProfile: { create: vi.fn().mockResolvedValue({}) } }),
    )
    mockCreate.mockResolvedValueOnce({ id: 'new_user' })
    mockSignIn.mockResolvedValueOnce(undefined)

    const fd = makeFormData({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
      role: 'CLIENT',
      phone: '12345678',
      callbackUrl: 'http://localhost:3000/dashboard',
    })

    const result = await registerAndLogin(null, fd)
    expect(result).toEqual({})
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ redirectTo: '/dashboard' }),
    )
  })

  it('returns empty fieldErrors when only role is invalid (hidden field tampering)', async () => {
    const fd = makeFormData({
      email: 'user@example.com',
      password: 'password123',
      name: 'Valid Name',
      role: 'ADMIN', // invalid — not CLIENT or PROVIDER
      phone: '12345678',
    })
    const result = await registerAndLogin(null, fd)
    expect(result.fieldErrors).toEqual({})
    expect(result.error).toBeUndefined()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
