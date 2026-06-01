import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { LocaleSwitcher } from './locale-switcher'
import { auth } from '@/lib/auth'
import type { Locale } from '@/i18n/request'

export async function SiteHeader() {
  const [t, locale, session] = await Promise.all([
    getTranslations('Header'),
    getLocale(),
    auth(),
  ])
  const typedLocale = locale as Locale

  const dashboardHref =
    session?.user.role === 'PROVIDER' ? '/dashboard/applications' : '/dashboard/jobs'

  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-40">
      <div className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-base w-full max-w-7xl mx-auto">
        <Link
          href="/"
          className="text-headline-md text-primary flex items-center gap-2"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            handshake
          </span>
          ServiLocal
        </Link>

        <nav className="hidden md:flex gap-8 items-center">
          <Link
            href="/jobs"
            className="text-label-md text-on-surface-variant hover:text-secondary transition-colors duration-200"
          >
            {t('findWork')}
          </Link>
          <Link
            href="/dashboard/jobs/new"
            className="text-label-md text-on-surface-variant hover:text-secondary transition-colors duration-200"
          >
            {t('postJob')}
          </Link>
          <Link
            href="/about"
            className="text-label-md text-on-surface-variant hover:text-secondary transition-colors duration-200"
          >
            {t('about')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher currentLocale={typedLocale} />

          {session ? (
            <Link
              href={dashboardHref}
              className="btn-press flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-full text-label-md hover:opacity-90"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                account_circle
              </span>
              <span className="hidden sm:inline">{session.user.name?.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="btn-press bg-primary text-on-primary px-6 py-2 rounded-full text-label-md hover:opacity-90"
            >
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
