import { PageLoader } from '@/components/ui/page-loader'

export default function MarketplaceLoading() {
  return (
    <div className="motion-panel fixed inset-0 z-90 flex items-center justify-center bg-background">
      <PageLoader />
    </div>
  )
}
