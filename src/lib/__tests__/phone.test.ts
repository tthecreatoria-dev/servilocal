import { describe, it, expect } from 'vitest'
import { whatsappNumber } from '@/lib/phone'

describe('whatsappNumber', () => {
  it('antepone 503 a un número local salvadoreño de 8 dígitos', () => {
    expect(whatsappNumber('7900-0000')).toBe('50379000000')
    expect(whatsappNumber('7900 0000')).toBe('50379000000')
  })

  it('conserva el número cuando ya trae el código de El Salvador', () => {
    expect(whatsappNumber('+503 7900 0000')).toBe('50379000000')
  })

  it('conserva códigos de país extranjeros', () => {
    expect(whatsappNumber('+1 415 555 0100')).toBe('14155550100')
  })

  it('devuelve null cuando el número es demasiado corto', () => {
    expect(whatsappNumber('123')).toBe(null)
    expect(whatsappNumber('')).toBe(null)
  })
})
