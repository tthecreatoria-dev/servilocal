import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function SiteFooter() {
  const t = await getTranslations('Footer')

  const links = [
    { key: 'terms' as const, href: '/terms' },
    { key: 'privacy' as const, href: '/privacy' },
    { key: 'help' as const, href: '/help' },
    { key: 'safety' as const, href: '/safety' },
  ]

  return (
    <footer className="bg-surface-container-low border-t border-outline-variant mt-app-xl">
      <div className="flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-margin-desktop py-app-lg w-full max-w-7xl mx-auto">
        <div className="mb-6 md:mb-0 flex flex-col items-center md:items-start">
          <span className="text-headline-md text-primary flex items-center gap-2 mb-2">
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              handshake
            </span>
            ServiLocal
          </span>
          <p className="text-body-md text-on-surface">{t('tagline')}</p>
        </div>

        <nav className="flex flex-wrap justify-center md:justify-end gap-6">
          {links.map(({ key, href }) => (
            <Link
              key={href}
              href={href}
              className="text-label-md text-on-surface-variant hover:text-primary underline transition-colors duration-200"
            >
              {t(key)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
