import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function SiteFooter() {
  const [t, headerT] = await Promise.all([
    getTranslations('Footer'),
    getTranslations('Header'),
  ])

  const exploreLinks = [
    { href: '/providers', label: t('providers') },
    { href: '/jobs', label: headerT('findWork') },
    { href: '/dashboard/jobs/new', label: headerT('postJob') },
  ]

  const supportLinks = [
    { key: 'terms' as const, href: '/terms' },
    { key: 'privacy' as const, href: '/privacy' },
    { key: 'help' as const, href: '/help' },
    { key: 'safety' as const, href: '/safety' },
  ]

  return (
    <footer className="motion-footer mt-app-xl bg-surface-container border-t border-outline-variant">
      <div className="w-full max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop pt-12 pb-28 md:py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.95fr)] md:gap-12">
          <div className="flex flex-col items-start">
            <Link
              href="/"
              className="motion-brand text-headline-md text-primary flex items-center gap-2"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                handshake
              </span>
              ServiLocal
            </Link>
            <p className="mt-3 max-w-sm text-body-md text-on-surface-variant">
              {t('description')}
            </p>
          </div>

          <FooterLinkGroup title={t('explore')} links={exploreLinks} />
          <FooterLinkGroup
            title={t('support')}
            links={supportLinks.map(({ key, href }) => ({ href, label: t(key) }))}
          />
        </div>

        <p className="mt-10 text-label-sm text-on-surface-variant">{t('tagline')}</p>
      </div>
    </footer>
  )
}

function FooterLinkGroup({
  title,
  links,
}: {
  title: string
  links: { href: string; label: string }[]
}) {
  return (
    <nav aria-label={title}>
      <h2 className="text-label-md text-primary">{title}</h2>
      <div className="mt-4 flex flex-col items-start gap-3">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="motion-footer-link text-body-md text-on-surface-variant transition-colors duration-200 hover:text-secondary"
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
