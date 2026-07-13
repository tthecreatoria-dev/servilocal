import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { rankProviders, type ProviderForRanking } from '@/lib/provider-search'
import { CATEGORY_SEO, SITE_NAME, appUrl, categoryFromSlug, categoryPath } from '@/lib/seo'
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_KEYS } from '@/lib/categories'
import { ProviderCard } from '@/components/features/provider-card'
import { JsonLd } from '@/components/features/json-ld'
import type { ServiceCategory } from '@/types/index'

// Landing indexable por categoría. Siempre dinámica: el listado de
// proveedores debe reflejar la DB actual, no un snapshot del build.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoria: string }>
}): Promise<Metadata> {
  const { categoria } = await params
  const category = categoryFromSlug(categoria)
  // notFound() aquí (y no solo en la página) para que la respuesta sea un
  // 404 real: la página corre después de que el streaming ya envió el 200.
  if (!category) notFound()

  const seo = CATEGORY_SEO[category]
  const title = `${seo.plural} en El Salvador — contrata con garantía`
  const path = categoryPath(category)

  return {
    title,
    description: seo.description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: seo.description,
      url: path,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: seo.description,
    },
  }
}

async function getProvidersByCategory(category: ServiceCategory) {
  const rows = await db.providerProfile.findMany({
    where: { skills: { has: category } },
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

  return rankProviders(candidates, null)
}

export default async function CategoryLandingPage({
  params,
}: {
  params: Promise<{ categoria: string }>
}) {
  const { categoria } = await params
  const category = categoryFromSlug(categoria)
  if (!category) notFound()

  const seo = CATEGORY_SEO[category]
  const providers = await getProvidersByCategory(category)
  const otherCategories = CATEGORY_KEYS.filter((key) => key !== category)

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: CATEGORY_LABELS[category],
    name: `${seo.plural} en El Salvador`,
    description: seo.description,
    url: `${appUrl()}${categoryPath(category)}`,
    areaServed: { '@type': 'Country', name: 'El Salvador' },
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: appUrl(),
    },
  }

  return (
    <div>
      <JsonLd data={serviceJsonLd} />

      {/* Hero de categoría */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant mb-3">
          <span className="material-symbols-outlined text-[16px]">{CATEGORY_ICONS[category]}</span>
          {CATEGORY_LABELS[category]}
        </span>
        <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary">
          {seo.plural} de confianza en El Salvador
        </h1>
        <p className="text-body-md text-on-surface-variant mt-2 max-w-2xl">
          {seo.description} Publica lo que necesitas gratis, compara propuestas y tu pago queda
          en custodia hasta que el trabajo esté terminado.
        </p>
      </div>

      {/* CTA principal */}
      <div className="flex flex-wrap gap-3 mb-10">
        <Link
          href={`/dashboard/jobs/new?category=${category}`}
          className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
        >
          Publicar un trabajo de {CATEGORY_LABELS[category]}
        </Link>
        <Link
          href={`/providers?category=${category}`}
          className="btn-press border border-outline-variant text-on-surface px-6 py-3 rounded-full text-label-md hover:bg-surface-variant transition-colors"
        >
          Buscar por ubicación
        </Link>
      </div>

      {/* Proveedores */}
      <h2 className="text-headline-md text-on-surface mb-4">
        {providers.length > 0
          ? `${seo.plural} disponibles`
          : `Aún no hay ${seo.plural.toLowerCase()} registrados`}
      </h2>
      {providers.length === 0 ? (
        <div className="flex flex-col items-start gap-4 bg-surface-container rounded-2xl p-6 mb-12 max-w-xl">
          <p className="text-body-md text-on-surface-variant">
            Publica tu trabajo y te avisaremos cuando un profesional de{' '}
            {CATEGORY_LABELS[category]} envíe una propuesta.
          </p>
          <Link
            href={`/dashboard/jobs/new?category=${category}`}
            className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Publicar trabajo gratis
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}

      {/* Cómo funciona — contenido indexable */}
      <section className="bg-surface-container-low rounded-2xl p-6 md:p-8 mb-12">
        <h2 className="text-headline-md text-on-surface mb-4">
          Cómo contratar {seo.plural.toLowerCase()} en ServiLocal
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 list-none">
          {[
            {
              title: 'Publica tu trabajo gratis',
              desc: 'Describe lo que necesitas, tu presupuesto y tu zona. Toma menos de dos minutos.',
            },
            {
              title: 'Compara propuestas y perfiles',
              desc: 'Revisa calificaciones, reseñas y precios de profesionales cerca de ti antes de elegir.',
            },
            {
              title: 'Paga con protección',
              desc: 'Tu pago queda en custodia y solo se libera cuando confirmas que el trabajo está completado.',
            },
          ].map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="w-8 h-8 rounded-full bg-primary text-on-primary text-label-md flex items-center justify-center">
                {i + 1}
              </span>
              <h3 className="text-label-md text-on-surface">{step.title}</h3>
              <p className="text-body-md text-on-surface-variant">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Interlinking con las demás categorías */}
      <section>
        <h2 className="text-headline-md text-on-surface mb-4">Otros servicios en El Salvador</h2>
        <div className="flex flex-wrap gap-2">
          {otherCategories.map((key) => (
            <Link
              key={key}
              href={categoryPath(key)}
              className="inline-flex items-center gap-1.5 bg-surface-container px-3.5 py-2 rounded-full text-label-sm text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">{CATEGORY_ICONS[key]}</span>
              {CATEGORY_SEO[key].plural}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
