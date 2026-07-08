import Link from 'next/link'
import { db } from '@/lib/db'
import { geocodeAddress } from '@/lib/geocode'
import { rankProviders, type ProviderForRanking } from '@/lib/provider-search'
import { ProviderCard } from '@/components/features/provider-card'
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_LABELS, CATEGORY_KEYS as CATEGORIES } from '@/lib/categories'

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; location?: string }>
}) {
  const { category, location } = await searchParams

  const validCategory = CATEGORIES.includes(category as ServiceCategory)
    ? (category as ServiceCategory)
    : undefined

  const locationQuery = location?.trim() || undefined
  const searchPoint = locationQuery ? await geocodeAddress(locationQuery) : null
  const geocodeFailed = Boolean(locationQuery) && searchPoint === null

  const rows = await db.providerProfile.findMany({
    where: validCategory ? { skills: { has: validCategory } } : {},
    include: { user: { select: { name: true } } },
  })

  const candidates: ProviderForRanking[] = rows.map((row) => ({
    id:           row.id,
    slug:         row.slug,
    name:         row.user.name,
    bio:          row.bio,
    skills:       row.skills as ServiceCategory[],
    rating:       row.rating,
    totalReviews: row.totalReviews,
    isRemote:     row.isRemote,
    address:      row.address,
    latitude:     row.latitude,
    longitude:    row.longitude,
  }))

  const providers = rankProviders(candidates, searchPoint)

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary">
          Profesionales disponibles
        </h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Encuentra trabajadores con la habilidad que necesitas cerca de ti.
        </p>
      </div>

      {/* Search bar — plain GET form, mirrors /jobs */}
      <form method="GET" action="/providers" className="mb-6 flex flex-col sm:flex-row gap-3 max-w-2xl">
        <select
          name="category"
          defaultValue={validCategory ?? ''}
          className="bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3.5 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
            location_on
          </span>
          <input
            name="location"
            defaultValue={locationQuery}
            placeholder="¿Dónde? Ej: San Salvador"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-28 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            type="submit"
            className="btn-press absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md hover:opacity-90 transition-opacity"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* Notices */}
      {geocodeFailed && (
        <p className="text-label-sm text-on-surface-variant mb-4">
          No pudimos ubicar <strong className="text-on-surface">&quot;{locationQuery}&quot;</strong>.
          Mostrando todos los profesionales{validCategory ? ` de ${CATEGORY_LABELS[validCategory]}` : ''}.
        </p>
      )}
      {!geocodeFailed && (validCategory || locationQuery) && (
        <p className="text-label-sm text-on-surface-variant mb-4">
          {providers.length} resultado{providers.length !== 1 ? 's' : ''}
          {validCategory && <> en <strong className="text-on-surface">{CATEGORY_LABELS[validCategory]}</strong></>}
          {searchPoint && <> cerca de <strong className="text-on-surface">{locationQuery}</strong></>}
          {' · '}
          <Link href="/providers" className="text-primary hover:underline">Limpiar filtros</Link>
        </p>
      )}

      {/* Results */}
      {providers.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">person_off</span>
          <p className="text-headline-md text-on-surface-variant">No hay profesionales disponibles</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            Intenta con otra categoría o amplía tu zona de búsqueda.
          </p>
          <Link
            href="/providers"
            className="btn-press mt-2 bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Ver todos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  )
}
