// Single source of truth for how each ServiceCategory is presented in the UI.
// Keep these maps exhaustive — the `Record<ServiceCategory, …>` type forces an
// entry for every category in src/types/index.ts / prisma/schema.prisma.
import type { ServiceCategory } from '@/types/index'

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING:         'Fontanería',
  TEACHING:         'Enseñanza',
  DELIVERY:         'Delivery',
  CLEANING:         'Limpieza',
  ELECTRICAL:       'Electricista',
  MASONRY:          'Albañilería',
  WELDING:          'Soldadura',
  ELECTRONICS:      'Electrónica',
  APPLIANCE_REPAIR: 'Refrigeración y lavadoras',
  DESIGN:           'Diseño',
  DIGITAL:          'Digital',
}

export const CATEGORY_ICONS: Record<ServiceCategory, string> = {
  PLUMBING:         'plumbing',
  TEACHING:         'school',
  DELIVERY:         'local_shipping',
  CLEANING:         'cleaning_services',
  ELECTRICAL:       'electrical_services',
  MASONRY:          'foundation',
  WELDING:          'local_fire_department',
  ELECTRONICS:      'memory',
  APPLIANCE_REPAIR: 'home_repair_service',
  DESIGN:           'palette',
  DIGITAL:          'computer',
}

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as ServiceCategory[]

// Valida un valor externo (p. ej. un query param) contra las categorías canónicas.
export function parseCategoryParam(value: string | undefined): ServiceCategory | null {
  return value !== undefined && (CATEGORY_KEYS as string[]).includes(value)
    ? (value as ServiceCategory)
    : null
}
