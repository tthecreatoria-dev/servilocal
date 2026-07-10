import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicProviderProfile } from '@/lib/provider-profile'
import { whatsappNumber } from '@/lib/phone'
import { InitialsAvatar } from '@/components/features/initials-avatar'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/lib/categories'

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/['"]/g, '').trimEnd()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await getPublicProviderProfile(slug)
  if (!profile) return { title: 'Perfil no encontrado | ServiLocal' }

  const mainCategory = profile.skills[0]
  const title = mainCategory
    ? `${profile.name} — ${CATEGORY_LABELS[mainCategory]} | ServiLocal`
    : `${profile.name} | ServiLocal`
  const fallbackDescription = `Perfil de ${profile.name} en ServiLocal, el marketplace de servicios locales de El Salvador.`
  const bio = profile.bio.length > 155 ? `${profile.bio.slice(0, 152)}...` : profile.bio
  const description = bio || fallbackDescription

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl()}/providers/${profile.slug}`,
      siteName: 'ServiLocal',
      type: 'profile',
    },
  }
}

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const profile = await getPublicProviderProfile(slug)
  if (!profile) notFound()

  const locationLabel = profile.isRemote
    ? 'En línea'
    : (profile.address ?? 'Ubicación no especificada')
  const hireHref = profile.skills[0]
    ? `/dashboard/jobs/new?invite=${profile.slug}&category=${profile.skills[0]}`
    : `/dashboard/jobs/new?invite=${profile.slug}`
  const waNumber = profile.phone ? whatsappNumber(profile.phone) : null

  return (
    <div className="motion-section max-w-2xl mx-auto">
      <Link
        href="/providers"
        className="motion-interactive inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Profesionales disponibles
      </Link>

      {/* Header card */}
      <div className="motion-surface motion-reveal bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <div className="flex items-center gap-4 mb-4">
          <InitialsAvatar name={profile.name} sizeClass="w-16 h-16 text-headline-md" />
          <div>
            <h1 className="text-headline-lg-mobile text-primary">{profile.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-label-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1">
                <span
                  className="material-symbols-outlined text-[16px] text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
                {profile.rating.toFixed(1)}
                <span className="text-on-surface-variant/60">({profile.totalReviews} reseñas)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">location_on</span>
                {locationLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {profile.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-full text-label-sm text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[14px]">{CATEGORY_ICONS[skill]}</span>
              {CATEGORY_LABELS[skill]}
            </span>
          ))}
        </div>

        {profile.bio && (
          <p className="text-body-md text-on-surface leading-relaxed">{profile.bio}</p>
        )}
      </div>

      {/* Services */}
      {profile.services.length > 0 && (
        <div className="motion-surface motion-reveal bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-headline-md text-on-surface mb-4">Servicios</h2>
          <ul className="motion-list divide-y divide-outline-variant">
            {profile.services.map((service) => (
              <li key={service.id} className="motion-list-item py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div>
                  <p className="text-label-md text-on-surface">{service.title}</p>
                  <p className="text-body-md text-on-surface-variant line-clamp-2 mt-0.5">
                    {service.description}
                  </p>
                </div>
                <span className="text-label-md text-primary whitespace-nowrap">
                  ${service.price.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hire via platform */}
      <div className="motion-surface motion-reveal bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <div className="flex items-start gap-3 mb-5">
          <span
            className="material-symbols-outlined text-primary text-[28px] mt-0.5 shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified_user
          </span>
          <div>
            <p className="text-label-md text-on-surface">Contrata con garantía de ServiLocal</p>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Tu pago queda en custodia y solo se libera cuando el trabajo está completado.
              Calidad garantizada y soporte en caso de disputa.
            </p>
          </div>
        </div>
        <Link
          href={hireHref}
          className="motion-interactive btn-press inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary py-3.5 rounded-full text-label-md hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            handshake
          </span>
          Contratar con garantía
        </Link>
      </div>

      {/* Direct contact — only when the provider opted in */}
      {profile.phone && (
        <div className="motion-surface motion-reveal bg-surface-container border border-outline-variant rounded-2xl p-6">
          <p className="text-label-md text-on-surface mb-1">Contacto directo</p>
          <p className="text-body-md text-on-surface-variant mb-4">
            El contacto directo ocurre fuera de ServiLocal — sin garantía ni protección de pago.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-label-md text-on-surface">
              <span className="material-symbols-outlined text-[18px]">call</span>
              {profile.phone}
            </span>
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="motion-interactive btn-press inline-flex items-center gap-2 border border-outline-variant bg-surface-container-lowest px-4 py-2 rounded-full text-label-md text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                Escribir por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
