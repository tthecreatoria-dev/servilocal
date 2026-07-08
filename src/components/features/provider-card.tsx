import Link from 'next/link'
import type { RankedProvider } from '@/lib/provider-search'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/lib/categories'
import { InitialsAvatar } from '@/components/features/initials-avatar'

export function ProviderCard({ provider }: { provider: RankedProvider }) {
  const locationLabel =
    provider.distanceKm !== null
      ? `a ${provider.distanceKm.toFixed(1)} km`
      : provider.isRemote
        ? 'En línea'
        : (provider.address ?? 'Ubicación no especificada')

  return (
    <Link href={`/providers/${provider.slug}`} className="block">
      <article className="card-hover bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-label-md text-on-surface flex items-center gap-2">
            <InitialsAvatar name={provider.name} sizeClass="w-8 h-8 text-label-sm" />
            {provider.name}
          </h2>
          <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
            <span
              className="material-symbols-outlined text-[16px] text-secondary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            {provider.rating.toFixed(1)}
            <span className="text-on-surface-variant/60">({provider.totalReviews})</span>
          </span>
        </div>

        {provider.bio && (
          <p className="text-body-md text-on-surface-variant line-clamp-2 mb-4">{provider.bio}</p>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          {provider.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-full text-label-sm text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[14px]">{CATEGORY_ICONS[skill]}</span>
              {CATEGORY_LABELS[skill]}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 pt-3 border-t border-outline-variant mt-auto text-label-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">location_on</span>
          {locationLabel}
        </div>
      </article>
    </Link>
  )
}
