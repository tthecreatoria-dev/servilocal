const SV_COUNTRY_CODE = '503'
const SV_LOCAL_LENGTH = 8

/**
 * Normaliza un teléfono libre a formato internacional sin "+" para wa.me.
 * Devuelve null si el número es demasiado corto para ser enlazable.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < SV_LOCAL_LENGTH) return null
  if (digits.length === SV_LOCAL_LENGTH) return `${SV_COUNTRY_CODE}${digits}`
  return digits
}
