import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSet = vi.hoisted(() => vi.fn())
const mockCookies = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({ cookies: mockCookies }))
vi.mock('next-intl/server', () => ({
  getRequestConfig: (fn: unknown) => fn,
}))

import { setLocale } from '@/actions/locale'

describe('setLocale()', () => {
  beforeEach(() => {
    mockSet.mockClear()
    mockCookies.mockResolvedValue({ set: mockSet })
  })

  it('sets NEXT_LOCALE cookie to es', async () => {
    await setLocale('es')
    expect(mockSet).toHaveBeenCalledWith('NEXT_LOCALE', 'es', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  })

  it('sets NEXT_LOCALE cookie to en', async () => {
    await setLocale('en')
    expect(mockSet).toHaveBeenCalledWith('NEXT_LOCALE', 'en', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  })

  it('does nothing for an invalid locale', async () => {
    await setLocale('fr' as never)
    expect(mockSet).not.toHaveBeenCalled()
  })
})
