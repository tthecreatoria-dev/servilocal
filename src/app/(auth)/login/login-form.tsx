'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { login } from '@/actions/auth'
import type { AuthState } from '@/actions/auth'
import { SubmitButton } from '@/components/ui/submit-button'

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('Auth')
  const [state, formAction] = useActionState<AuthState | null, FormData>(login, null)

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-md p-6 sm:p-10">
      <div className="flex items-center gap-2 mb-8">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          handshake
        </span>
        <span className="text-headline-md text-primary">ServiLocal</span>
      </div>

      <h1 className="text-headline-md text-on-surface mb-2">{t('login.title')}</h1>
      <p className="text-body-md text-on-surface-variant mb-8">{t('login.subtitle')}</p>

      {state?.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-label-md mb-4">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <div>
          <label htmlFor="email" className="text-label-md text-on-surface-variant block mb-1">
            {t('fields.email')}
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
          <label htmlFor="password" className="text-label-md text-on-surface-variant block mb-1">
            {t('fields.password')}
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

        <SubmitButton label={t('login.button')} />
      </form>

      <p className="text-center text-body-md text-on-surface-variant mt-8">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="text-primary font-semibold hover:underline">
          {t('login.registerLink')}
        </Link>
      </p>
    </div>
  )
}
