'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/actions/locale'
import type { Locale } from '@/i18n/request'

interface LocaleSwitcherProps {
  currentLocale: Locale
}

export function LocaleSwitcher({ currentLocale }: LocaleSwitcherProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const next: Locale = currentLocale === 'es' ? 'en' : 'es'

  function handleSwitch() {
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleSwitch}
      disabled={isPending}
      aria-label="Switch language"
      className="btn-press px-3 py-1.5 rounded-full border border-outline-variant text-label-sm text-on-surface-variant hover:bg-surface-variant transition-colors duration-200 disabled:opacity-50"
    >
      {currentLocale === 'es' ? 'EN' : 'ES'}
    </button>
  )
}
