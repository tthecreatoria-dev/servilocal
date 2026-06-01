'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/actions/locale'
import type { Locale } from '@/i18n/request'

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()

  async function handleSwitch(next: Locale) {
    try {
      await setLocale(next)
      router.refresh()
    } catch {
      // locale switch failed — page will still be in current language
    }
  }

  return (
    <div className="flex items-center gap-1 text-label-md">
      <button
        onClick={() => handleSwitch('es')}
        className={
          locale === 'es'
            ? 'font-semibold text-on-surface'
            : 'text-on-surface-variant hover:text-on-surface transition-colors'
        }
      >
        Español
      </button>
      <span className="text-on-surface-variant select-none">/</span>
      <button
        onClick={() => handleSwitch('en')}
        className={
          locale === 'en'
            ? 'font-semibold text-on-surface'
            : 'text-on-surface-variant hover:text-on-surface transition-colors'
        }
      >
        English
      </button>
    </div>
  )
}
