import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const NAV_ITEMS = [
  { href: '/', icon: 'home', key: 'home', fill: true },
  { href: '/services', icon: 'work', key: 'jobs', fill: false },
  { href: '/messages', icon: 'chat_bubble', key: 'messages', fill: false },
  { href: '/profile', icon: 'person', key: 'profile', fill: false },
] as const

interface BottomNavProps {
  activePath?: string
}

export async function BottomNav({ activePath = '/' }: BottomNavProps) {
  const t = await getTranslations('BottomNav')

  return (
    <nav className="bg-surface-container shadow-sm fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-gutter pb-4 pt-2 md:hidden rounded-t-xl">
      {NAV_ITEMS.map(({ href, icon, key, fill }) => {
        const isActive = activePath === href
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex flex-col items-center justify-center px-4 py-1 rounded-full transition-colors duration-200',
              isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-variant',
            ].join(' ')}
          >
            <span
              className="material-symbols-outlined mb-1 text-2xl"
              style={
                isActive && fill
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              {icon}
            </span>
            <span className="text-label-sm">{t(key)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
