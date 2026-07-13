import { ImageResponse } from 'next/og'
import { appUrl } from '@/lib/seo'

// Imagen Open Graph de marca. Sin emoji ni fuentes remotas: satori tendría
// que descargarlas en cada request y fallaría sin red.
export const alt = 'ServiLocal — servicios locales de confianza en El Salvador'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = {
  primary: '#0784f2',
  secondary: '#1e3a8a',
  container: '#e3f6ff',
  white: '#ffffff',
}

export default function Image() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 84,
              height: 84,
              borderRadius: 42,
              background: BRAND.white,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill={BRAND.primary}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 700 }}>ServiLocal</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
            Albañiles, electricistas y fontaneros de confianza
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: BRAND.container }}>
            Tu pago queda protegido hasta que el trabajo esté terminado.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 28,
            color: BRAND.container,
          }}
        >
          <div style={{ display: 'flex' }}>El Salvador</div>
          <div style={{ display: 'flex' }}>{new URL(appUrl()).host}</div>
        </div>
      </div>
    ),
    size,
  )
}
