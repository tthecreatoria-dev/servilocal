import type { Metadata } from 'next'
import { db } from '@/lib/db'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_ICONS, CATEGORY_KEYS as CATEGORIES } from '@/lib/categories'
import { ServicePicker, type ServicePickerOption } from '@/components/features/service-picker'

export const metadata: Metadata = {
  title: 'Trabajos disponibles para profesionales',
  description:
    'Encuentra trabajos de albañilería, electricidad, fontanería, limpieza y más en El Salvador. Envía tu propuesta y cobra con pago protegido en ServiLocal.',
  alternates: { canonical: '/jobs' },
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>
}) {
  const { category, q } = await searchParams

  const [t, tHome, locale] = await Promise.all([
    getTranslations('JobsPage'),
    getTranslations('HomePage'),
    getLocale(),
  ])

  const validCategory = CATEGORIES.includes(category as ServiceCategory)
    ? (category as ServiceCategory)
    : undefined

  const searchQuery = q?.trim() || undefined

  const categoryLabel = (cat: ServiceCategory) => tHome(`serviceCategory.${cat}`)

  const categoryOptions: ServicePickerOption[] = CATEGORIES.map((cat) => ({
    value: cat,
    label: categoryLabel(cat),
    icon: CATEGORY_ICONS[cat],
  }))

  const dateLocale = locale === 'en' ? 'en-US' : 'es-SV'

  const jobs = await db.jobPost.findMany({
    where: {
      status: 'OPEN',
      invitedProviderId: null,
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

  return (
    <div className="motion-section">
      {/* Header + search — vertically centered block, mirrors the homepage hero */}
      <div className="motion-reveal mb-8 flex flex-col items-center justify-center text-center min-h-[50vh] gap-8">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary">
            {t('title')}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {t('subtitle')}
          </p>
        </div>

        {/* Search bar — category + text query in one unified control, mirrors the homepage hero search */}
        <form
          method="GET"
          action="/jobs"
          className="motion-surface w-full max-w-2xl mx-auto bg-surface-container-lowest rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row gap-0 md:gap-2 shadow-sm border border-outline-variant"
        >
          <ServicePicker
            name="category"
            options={categoryOptions}
            defaultValue={validCategory}
            placeholder={t('categoryPlaceholder')}
            searchLabel={t('searchCategoryLabel')}
            allServicesLabel={t('allCategoriesLabel')}
            noResultsLabel={t('noCategoryResultsLabel')}
          />
          <div className="flex-1 flex items-center px-4 py-3 border-b md:border-b-0 border-outline-variant">
            <span className="material-symbols-outlined text-outline mr-2 flex-shrink-0">
              search
            </span>
            <input
              name="q"
              defaultValue={searchQuery}
              type="text"
              placeholder={t('queryPlaceholder')}
              className="motion-field w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md outline-none placeholder:text-on-surface-variant/60"
            />
          </div>
          <button
            type="submit"
            className="motion-interactive btn-press bg-primary text-on-primary px-8 py-3 mt-2 md:mt-0 rounded-xl md:rounded-full text-label-md w-full md:w-auto"
          >
            {t('searchButton')}
          </button>
        </form>
      </div>

      {/* Section title */}
      <h2 className="motion-reveal text-headline-md text-on-surface mb-4">
        {t('allJobsTitle')}
      </h2>

      {/* Results count */}
      {(searchQuery || validCategory) && (
        <p className="motion-reveal text-label-sm text-on-surface-variant mb-4">
          {t('resultsCount', { count: jobs.length })}
          {searchQuery && <> {t('resultsFor', { query: searchQuery })}</>}
          {validCategory && <> {t('resultsIn', { category: categoryLabel(validCategory) })}</>}
          {' · '}
          <Link href="/jobs" className="link-quiet">
            {t('clearFilters')}
          </Link>
        </p>
      )}

      {/* Grid */}
      {jobs.length === 0 ? (
        <div className="motion-surface flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">work_off</span>
          <p className="text-headline-md text-on-surface-variant">{t('emptyTitle')}</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            {t('emptySubtitle')}
          </p>
          <Link
            href="/jobs"
            className="motion-interactive btn-press mt-2 bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            {t('viewAll')}
          </Link>
        </div>
      ) : (
        <div className="motion-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((job) => {
            const cat = job.category as ServiceCategory
            return (
              <article
                key={job.id}
                className="card-hover motion-surface motion-list-item bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col"
              >
                {/* Top row */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">
                      {CATEGORY_ICONS[cat]}
                    </span>
                    {categoryLabel(cat)}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">
                    {new Date(job.deadline).toLocaleDateString(dateLocale)}
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
                    className="motion-interactive btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-sm hover:opacity-90 transition-opacity"
                  >
                    {t('viewJob')}
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
