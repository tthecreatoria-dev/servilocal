import type { RankedProvider } from '@/lib/provider-search'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/lib/categories'

export function ProviderCard({ provider }: { provider: RankedProvider }) {
  const locationLabel =
    provider.distanceKm !== null
      ? `a ${provider.distanceKm.toFixed(1)} km`
      : provider.isRemote
        ? 'En línea'
        : (provider.address ?? 'Ubicación no especificada')

  return (
    <article className="card-hover bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-label-md text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
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
  )
}
