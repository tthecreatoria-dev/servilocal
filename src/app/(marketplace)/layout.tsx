import { SiteHeader } from '@/components/features/site-header'
import { SiteFooter } from '@/components/features/site-footer'
import { BottomNav } from '@/components/features/bottom-nav'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-20 md:pb-0">
      <SiteHeader />
      <main className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-8">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  )
}
