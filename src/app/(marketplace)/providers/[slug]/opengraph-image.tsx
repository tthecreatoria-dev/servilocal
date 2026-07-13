import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getPublicProviderProfile } from '@/lib/provider-profile'
import { getInitials } from '@/components/features/initials-avatar'
import { CATEGORY_LABELS } from '@/lib/categories'

// Tarjeta Open Graph por perfil: es lo que se ve al compartir el link de un
// trabajador por WhatsApp. Corre en Node (Prisma) y consulta la DB por request.
export const alt = 'Perfil de trabajador en ServiLocal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = {
  primary: '#0784f2',
  secondary: '#1e3a8a',
  container: '#e3f6ff',
  white: '#ffffff',
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill={filled ? '#fbbf24' : 'rgba(255,255,255,0.25)'}
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile = await getPublicProviderProfile(slug)
  if (!profile) notFound()

  const mainCategory = profile.skills[0]
  const categoryLabel = mainCategory ? CATEGORY_LABELS[mainCategory] : 'Servicios locales'
  const locationLabel = profile.isRemote ? 'En línea' : (profile.address ?? 'El Salvador')
  const filledStars = Math.round(profile.rating)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: `linear-gradient(135deg, ${BRAND.secondary} 0%, ${BRAND.primary} 100%)`,
          color: BRAND.white,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 180,
              height: 180,
              borderRadius: 90,
              background: BRAND.container,
              color: BRAND.secondary,
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            {getInitials(profile.name)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
              {profile.name}
            </div>
            <div style={{ display: 'flex', fontSize: 38, color: BRAND.container }}>
              {categoryLabel} · {locationLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} filled={i <= filledStars} />
              ))}
              <div style={{ display: 'flex', fontSize: 32, marginLeft: 12, color: BRAND.container }}>
                {profile.rating.toFixed(1)} ({profile.totalReviews} reseñas)
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: 28,
                background: BRAND.white,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill={BRAND.primary}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            ServiLocal
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: BRAND.container }}>
            Contrata con pago protegido
          </div>
        </div>
      </div>
    ),
    size,
  )
}
