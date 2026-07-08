import { describe, it, expect } from 'vitest'
import { getInitials } from '@/components/features/initials-avatar'

describe('getInitials', () => {
  it('toma las primeras letras de las dos primeras palabras', () => {
    expect(getInitials('Pedro García')).toBe('PG')
  })

  it('usa una sola letra para nombres de una palabra', () => {
    expect(getInitials('Pedro')).toBe('P')
  })

  it('ignora palabras extra', () => {
    expect(getInitials('María José López Ramos')).toBe('MJ')
  })

  it('devuelve "?" cuando el nombre está vacío', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials('   ')).toBe('?')
  })
})
