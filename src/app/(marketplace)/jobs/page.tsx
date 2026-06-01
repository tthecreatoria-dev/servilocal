import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types/index'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const CATEGORY_ICONS: Record<ServiceCategory, string> = {
  PLUMBING: 'plumbing',
  TEACHING: 'school',
  DELIVERY: 'local_shipping',
  CLEANING: 'cleaning_services',
  DESIGN:   'palette',
  DIGITAL:  'computer',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ServiceCategory[]

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>
}) {
  const { category, q } = await searchParams

  const validCategory = CATEGORIES.includes(category as ServiceCategory)
    ? (category as ServiceCategory)
    : undefined

  const searchQuery = q?.trim() || undefined

  const jobs = await db.jobPost.findMany({
    where: {
      status: 'OPEN',
      ...(validCategory ? { category: validCategory } : {}),
      ...(searchQuery
        ? {
            OR: [
              { title:       { contains: searchQuery, mode: 'insensitive' } },
              { description: { contains: searchQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Build href preserving the other param
  function catHref(cat?: ServiceCategory) {
    const params = new URLSearchParams()
    if (cat) params.set('category', cat)
    if (searchQuery) params.set('q', searchQuery)
    const qs = params.toString()
    return qs ? `/jobs?${qs}` : '/jobs'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary">
          Proyectos disponibles
        </h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Encuentra proyectos que coincidan con tus habilidades y aplica directamente.
        </p>
      </div>

      {/* Search bar — plain GET form so no JS needed */}
      <form method="GET" action="/jobs" className="mb-6">
        {validCategory && (
          <input type="hidden" name="category" value={validCategory} />
        )}
        <div className="relative max-w-xl">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
            search
          </span>
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="Buscar por título o descripción…"
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

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href={catHref()}
          className={`btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-label-sm border transition-colors ${
            !validCategory
              ? 'bg-primary text-on-primary border-primary'
              : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-primary/60 hover:bg-surface-container'
          }`}
        >
          Todos
        </Link>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={catHref(cat)}
            className={`btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-label-sm border transition-colors ${
              validCategory === cat
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-primary/60 hover:bg-surface-container'
            }`}
          >
            <span
              className="material-symbols-outlined text-[15px]"
              style={{ fontVariationSettings: `'FILL' ${validCategory === cat ? 1 : 0}` }}
            >
              {CATEGORY_ICONS[cat]}
            </span>
            {CATEGORY_LABELS[cat]}
          </Link>
        ))}
      </div>

      {/* Results count */}
      {(searchQuery || validCategory) && (
        <p className="text-label-sm text-on-surface-variant mb-4">
          {jobs.length} resultado{jobs.length !== 1 ? 's' : ''}
          {searchQuery && <> para <strong className="text-on-surface">"{searchQuery}"</strong></>}
          {validCategory && <> en <strong className="text-on-surface">{CATEGORY_LABELS[validCategory]}</strong></>}
          {' · '}
          <Link href="/jobs" className="text-primary hover:underline">
            Limpiar filtros
          </Link>
        </p>
      )}

      {/* Grid */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">work_off</span>
          <p className="text-headline-md text-on-surface-variant">No hay proyectos disponibles</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            Intenta con otra categoría o cambia los términos de búsqueda.
          </p>
          <Link
            href="/jobs"
            className="btn-press mt-2 bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Ver todos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((job) => {
            const cat = job.category as ServiceCategory
            return (
              <article
                key={job.id}
                className="card-hover bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col"
              >
                {/* Top row */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">
                      {CATEGORY_ICONS[cat]}
                    </span>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">
                    {new Date(job.deadline).toLocaleDateString('es-SV')}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-label-md text-on-surface mb-2 line-clamp-2 flex-grow-0">
                  {job.title}
                </h2>

                {/* Description */}
                <p className="text-body-md text-on-surface-variant line-clamp-2 mb-4 flex-grow">
                  {job.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-outline-variant mt-auto">
                  <div>
                    <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      {job.client.name}
                    </p>
                    <p className="text-label-md text-primary font-bold mt-0.5">
                      ${Number(job.budget).toFixed(2)}
                    </p>
                  </div>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-sm hover:opacity-90 transition-opacity"
                  >
                    Ver
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
