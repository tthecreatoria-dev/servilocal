'use server'

import { cookies } from 'next/headers'
import { locales, type Locale } from '@/i18n/request'

export async function setLocale(locale: Locale): Promise<void> {
  if (!locales.includes(locale)) return
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
