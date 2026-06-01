import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { SiteHeader } from '@/components/features/site-header'
import { SiteFooter } from '@/components/features/site-footer'
import { BottomNav } from '@/components/features/bottom-nav'
import type { ServiceCategory } from '@/types'

// ---- Types ----

type ActiveCategory = { category: ServiceCategory; icon: string }

type JobPostListing = {
  id: string
  title: string
  description: string
  budget: number
  category: ServiceCategory
  deadline: Date
  createdAt: Date
  client: { name: string }
}

// ---- Helpers ----

function secondsAgo(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000)
}

// ---- Data fetching ----

async function getActiveCategories(): Promise<ActiveCategory[]> {
  try {
    const jobs = await db.jobPost.findMany({
      where: { status: 'OPEN' },
      select: { category: true },
    })
    const uniqueCategories = [...new Set(jobs.map((j) => j.category))]
    if (uniqueCategories.length === 0) return []
    const configs = await db.categoryConfig.findMany({
      where: { category: { in: uniqueCategories } },
    })
    return configs.map((c) => ({
      category: c.category as ServiceCategory,
      icon: c.icon,
    }))
  } catch (e) {
    console.error('[getActiveCategories]', e)
    return []
  }
}

async function getActiveJobPosts(): Promise<JobPostListing[]> {
  try {
    const rows = await db.jobPost.findMany({
      where: { status: 'OPEN' },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    })
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      budget: Number(row.budget),
      category: row.category as ServiceCategory,
      deadline: row.deadline,
      createdAt: row.createdAt,
      client: { name: row.client.name },
    }))
  } catch {
    return []
  }
}

// ---- Page ----

export default async function HomePage() {
  const [jobs, categories, t] = await Promise.all([
    getActiveJobPosts(),
    getActiveCategories(),
    getTranslations('HomePage'),
  ])

  const categoryIconMap = Object.fromEntries(
    categories.map(({ category, icon }) => [category, icon])
  )

  const howItWorks = [
    {
      icon: 'edit_note',
      title: t('howItWorksStep1Title'),
      desc: t('howItWorksStep1Desc'),
    },
    {
      icon: 'manage_search',
      title: t('howItWorksStep2Title'),
      desc: t('howItWorksStep2Desc'),
    },
    {
      icon: 'lock',
      title: t('howItWorksStep3Title'),
      desc: t('howItWorksStep3Desc'),
    },
  ]

  return (
    <div className="pb-20 md:pb-0">
      <SiteHeader />

      <main className="max-w-7xl mx-auto">
        {/* Hero */}
        <section className="relative rounded-b-3xl md:rounded-3xl overflow-hidden mt-0 md:mt-6 px-margin-mobile md:px-margin-desktop bg-surface-container py-16 md:py-24 flex flex-col items-center text-center">
          {/* Background gradients */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none"
          />
          <div
            aria-hidden
            className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-secondary/15 to-transparent pointer-events-none rounded-full opacity-60"
          />
          <div
            aria-hidden
            className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-primary/15 to-transparent pointer-events-none rounded-full opacity-60"
          />

          <div className="relative z-10 max-w-3xl w-full flex flex-col items-center gap-6">
            <h1 className="hero-item hero-item-1 text-headline-lg-mobile md:text-display-lg text-primary w-full text-center">
              {t('heroTitle')}
            </h1>

            <p className="hero-item hero-item-2 text-body-lg text-on-surface-variant text-center max-w-xl">
              {t('heroSubtitle')}
            </p>

            {/* Search bar */}
            <form
              action="/jobs"
              className="hero-item hero-item-3 w-full max-w-2xl bg-surface-container-lowest rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row gap-0 md:gap-2 shadow-sm border border-outline-variant"
            >
              <div className="flex-1 flex items-center px-4 py-3 border-b md:border-b-0 md:border-r border-outline-variant">
                <span className="material-symbols-outlined text-outline mr-2 flex-shrink-0">
                  search
                </span>
                <input
                  name="q"
                  type="text"
                  placeholder={t('searchService')}
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md outline-none placeholder:text-on-surface-variant/60"
                />
              </div>
              <div className="flex-1 flex items-center px-4 py-3 border-b md:border-b-0 border-outline-variant">
                <span className="material-symbols-outlined text-outline mr-2 flex-shrink-0">
                  location_on
                </span>
                <input
                  name="location"
                  type="text"
                  placeholder={t('searchLocation')}
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md outline-none placeholder:text-on-surface-variant/60"
                />
              </div>
              <button
                type="submit"
                className="btn-press bg-secondary text-on-secondary px-8 py-3 mt-2 md:mt-0 rounded-xl md:rounded-full text-label-md hover:bg-primary transition-colors duration-200 w-full md:w-auto"
              >
                {t('searchButton')}
              </button>
            </form>

            {/* CTAs */}
            <div className="hero-item hero-item-4 flex flex-wrap justify-center gap-4">
              <Link
                href="/dashboard/jobs/new"
                className="btn-press bg-primary text-on-primary px-8 py-3 rounded-full text-label-md hover:opacity-90 shadow-sm"
              >
                {t('postJob')}
              </Link>
              <Link
                href="/jobs"
                className="btn-press border border-secondary text-secondary px-8 py-3 rounded-full text-label-md hover:bg-surface-variant transition-colors duration-200 bg-transparent"
              >
                {t('findWork')}
              </Link>
            </div>

            {/* Trust strip */}
            <div className="hero-item hero-item-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-label-sm text-on-surface-variant/70">
              <span className="flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined text-[15px] text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                {t('trustVerified')}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined text-[15px] text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  lock
                </span>
                {t('trustPayment')}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined text-[15px] text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  location_on
                </span>
                {t('trustLocal')}
              </span>
            </div>
          </div>
        </section>

        {/* Browse by Category */}
        <section className="px-margin-mobile md:px-margin-desktop py-16">
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-headline-lg-mobile md:text-headline-lg text-primary">
              {t('browseCategoriesTitle')}
            </h2>
            <Link
              href="/jobs"
              className="text-secondary text-label-md hover:underline flex items-center gap-1"
            >
              {t('seeAll')}
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 md:gap-6">
            {categories.map(({ category, icon }) => (
              <button
                key={category}
                className="flex flex-col items-center gap-2 md:gap-3 cursor-pointer"
                aria-label={t(`serviceCategory.${category}`)}
              >
                <div className="category-icon w-16 h-16 md:w-20 md:h-20 rounded-full bg-secondary-fixed flex items-center justify-center shadow-sm border-2 border-outline-variant">
                  <span
                    className="material-symbols-outlined text-on-secondary-fixed text-2xl md:text-3xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {icon}
                  </span>
                </div>
                <span className="text-label-sm md:text-label-md text-on-surface text-center leading-tight">
                  {t(`serviceCategory.${category}`)}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/*/!* How it works *!/*/}
        {/*<section className="px-margin-mobile md:px-margin-desktop py-12 md:py-16 bg-surface-container rounded-3xl mb-8 mx-margin-mobile md:mx-0">*/}
        {/*  <h2 className="text-headline-lg-mobile md:text-headline-lg text-primary text-center mb-10 md:mb-14">*/}
        {/*    {t('howItWorksTitle')}*/}
        {/*  </h2>*/}
        {/*  <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">*/}
        {/*    {howItWorks.map(({ icon, title, desc }, i) => (*/}
        {/*      <div*/}
        {/*        key={i}*/}
        {/*        className={`step-enter step-enter-${i + 1} flex flex-col items-center text-center`}*/}
        {/*      >*/}
        {/*        <div className="relative mb-5">*/}
        {/*          <div className="w-16 h-16 rounded-full bg-primary-container border-2 border-outline-variant flex items-center justify-center">*/}
        {/*            <span*/}
        {/*              className="material-symbols-outlined text-primary text-2xl"*/}
        {/*              style={{ fontVariationSettings: "'FILL' 1" }}*/}
        {/*            >*/}
        {/*              {icon}*/}
        {/*            </span>*/}
        {/*          </div>*/}
        {/*          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center leading-none">*/}
        {/*            {i + 1}*/}
        {/*          </span>*/}
        {/*        </div>*/}
        {/*        <h3 className="text-headline-md text-on-surface mb-2">{title}</h3>*/}
        {/*        <p className="text-body-md text-on-surface-variant max-w-xs">{desc}</p>*/}
        {/*      </div>*/}
        {/*    ))}*/}
        {/*  </div>*/}
        {/*</section>*/}

        {/* Active Job Listings */}
        <section className="px-margin-mobile md:px-margin-desktop py-8 bg-surface-container-low rounded-3xl mb-16">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h2 className="text-headline-lg-mobile md:text-headline-lg text-primary">
                {t('activeJobsTitle')}
              </h2>
              <p className="text-body-md text-on-surface-variant mt-1">
                {t('activeJobsSubtitle')}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-press px-4 py-2 rounded-full border border-outline-variant text-on-surface text-label-md hover:bg-surface-variant transition-colors duration-200">
                {t('sortNewest')}
              </button>
              <button className="btn-press px-4 py-2 rounded-full border border-outline-variant text-on-surface text-label-md hover:bg-surface-variant transition-colors duration-200">
                {t('sortBudget')}
              </button>
            </div>
          </div>

          {jobs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {jobs.map((job, i) => {
                  const delayIndex = Math.min(i + 1, 6)
                  const secs = secondsAgo(job.createdAt)
                  const timeLabel =
                    secs < 3600
                      ? t('timeAgo.minutesAgo', { count: Math.floor(secs / 60) })
                      : secs < 86400
                        ? t('timeAgo.hoursAgo', { count: Math.floor(secs / 3600) })
                        : t('timeAgo.daysAgo', { count: Math.floor(secs / 86400) })

                  return (
                    <article
                      key={job.id}
                      className={`card-enter card-enter-${delayIndex} card-hover bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col h-full`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="inline-flex items-center gap-1 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-[16px]">
                            {categoryIconMap[job.category] ?? 'work'}
                          </span>
                          {t(`serviceCategory.${job.category}`)}
                        </span>
                        <span className="text-on-surface-variant text-label-sm shrink-0">
                          {timeLabel}
                        </span>
                      </div>

                      <h3 className="text-headline-md text-on-surface mb-2 line-clamp-1">
                        {job.title}
                      </h3>
                      <p className="text-body-md text-on-surface-variant mb-4 line-clamp-2 flex-grow">
                        {job.description}
                      </p>

                      <div className="flex items-center gap-2 mb-4 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px]">person</span>
                        <span className="text-label-sm">{job.client.name}</span>
                      </div>

                      <div className="flex justify-between items-center mt-auto pt-4 border-t border-outline-variant">
                        <div className="bg-primary-container text-primary font-bold px-4 py-2 rounded-lg text-label-md">
                          ${job.budget.toFixed(2)}
                        </div>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="btn-press bg-primary text-on-primary px-5 py-2 rounded-full text-label-md hover:opacity-90 transition-opacity"
                        >
                          {t('viewJob')}
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="mt-8 text-center">
                <Link
                  href="/jobs"
                  className="btn-press border-2 border-primary text-primary px-8 py-3 rounded-full text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors duration-200 inline-block"
                >
                  {t('viewAllJobs')}
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title={t('noJobsTitle')}
              subtitle={t('noJobsSubtitle')}
              cta={t('postJob')}
            />
          )}
        </section>
      </main>

      <SiteFooter />
      <BottomNav activePath="/" />
    </div>
  )
}

function EmptyState({
  title,
  subtitle,
  cta,
}: {
  title: string
  subtitle: string
  cta: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-6xl text-outline mb-4">work_off</span>
      <p className="text-headline-md text-on-surface-variant mb-2">{title}</p>
      <p className="text-body-md text-on-surface-variant mb-6">{subtitle}</p>
      <Link
        href="/dashboard/jobs/new"
        className="btn-press bg-primary text-on-primary px-8 py-3 rounded-full text-label-md hover:opacity-90"
      >
        {cta}
      </Link>
    </div>
  )
}
