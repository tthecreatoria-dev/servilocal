// Single source of truth para SEO: URL base del sitio, slugs públicos en
// español de cada categoría y el copy que usan las landing pages indexables.
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_KEYS } from '@/lib/categories'

export const SITE_NAME = 'ServiLocal'

// El .env local guarda el valor entre comillas; se limpian aquí para que
// new URL() y los links absolutos de Open Graph no salgan malformados.
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    .replace(/['"]/g, '')
    .trim()
    .replace(/\/+$/, '')
}

export type CategorySeo = {
  /** Segmento público de la URL: /servicios/<slug> */
  slug: string
  /** Plural para títulos y h1: "Albañiles" */
  plural: string
  /** Meta description de la landing (~150 caracteres, con keywords) */
  description: string
}

export const CATEGORY_SEO: Record<ServiceCategory, CategorySeo> = {
  MASONRY: {
    slug: 'albanil',
    plural: 'Albañiles',
    description:
      'Contrata albañiles de confianza en El Salvador para construcción, remodelación, repello y obra gris. Pago protegido hasta que el trabajo esté terminado.',
  },
  ELECTRICAL: {
    slug: 'electricista',
    plural: 'Electricistas',
    description:
      'Electricistas calificados en El Salvador para instalaciones eléctricas, reparaciones y cableado residencial o comercial. Contrata con pago protegido.',
  },
  PLUMBING: {
    slug: 'fontanero',
    plural: 'Fontaneros',
    description:
      'Fontaneros y plomeros de confianza en El Salvador: fugas de agua, tuberías, grifos e instalaciones sanitarias. Contrata con pago protegido.',
  },
  CLEANING: {
    slug: 'limpieza',
    plural: 'Profesionales de limpieza',
    description:
      'Servicios de limpieza de casas y oficinas en El Salvador con personal de confianza. Publica tu trabajo y contrata con pago protegido.',
  },
  DELIVERY: {
    slug: 'delivery',
    plural: 'Repartidores',
    description:
      'Repartidores y mensajería local en El Salvador para entregas y mandados. Contrata delivery de confianza con pago protegido.',
  },
  WELDING: {
    slug: 'soldadura',
    plural: 'Soldadores',
    description:
      'Soldadores en El Salvador para portones, balcones, puertas y estructuras metálicas. Contrata con garantía y pago protegido.',
  },
  ELECTRONICS: {
    slug: 'electronica',
    plural: 'Técnicos en electrónica',
    description:
      'Técnicos en electrónica en El Salvador: reparación de televisores, equipos de sonido y más. Contrata con pago protegido.',
  },
  APPLIANCE_REPAIR: {
    slug: 'refrigeracion-y-lavadoras',
    plural: 'Técnicos en refrigeración y lavadoras',
    description:
      'Reparación de refrigeradoras, lavadoras y aires acondicionados en El Salvador. Técnicos de confianza con pago protegido.',
  },
  TEACHING: {
    slug: 'clases',
    plural: 'Profesores particulares',
    description:
      'Profesores particulares en El Salvador: refuerzo escolar, idiomas, música y más. Encuentra al maestro ideal con pago protegido.',
  },
  DESIGN: {
    slug: 'diseno',
    plural: 'Diseñadores',
    description:
      'Diseñadores gráficos y creativos en El Salvador para logos, branding y material publicitario. Contrata freelancers con pago protegido.',
  },
  DIGITAL: {
    slug: 'servicios-digitales',
    plural: 'Freelancers digitales',
    description:
      'Freelancers digitales en El Salvador: páginas web, redes sociales, marketing y más. Contrata servicios digitales con pago protegido.',
  },
}

const SLUG_TO_CATEGORY: ReadonlyMap<string, ServiceCategory> = new Map(
  CATEGORY_KEYS.map((category) => [CATEGORY_SEO[category].slug, category]),
)

// Valida un slug externo (segmento de URL) contra los slugs canónicos.
export function categoryFromSlug(slug: string): ServiceCategory | null {
  return SLUG_TO_CATEGORY.get(slug) ?? null
}

export function categoryPath(category: ServiceCategory): string {
  return `/servicios/${CATEGORY_SEO[category].slug}`
}
