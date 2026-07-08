import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug } from '@/lib/slug'

describe('slugify', () => {
  it('convierte un nombre simple a kebab-case', () => {
    expect(slugify('Juan Perez')).toBe('juan-perez')
  })

  it('elimina acentos y diacríticos, incluida la ñ', () => {
    expect(slugify('José Muñoz')).toBe('jose-munoz')
    expect(slugify('Ángela Ordóñez')).toBe('angela-ordonez')
  })

  it('reemplaza caracteres especiales por guiones y los colapsa', () => {
    expect(slugify('★ Pedro!! García ★')).toBe('pedro-garcia')
    expect(slugify('  a -- b  ')).toBe('a-b')
  })

  it('usa el fallback "trabajador" cuando no queda nada tras normalizar', () => {
    expect(slugify('🔥🔥')).toBe('trabajador')
    expect(slugify('')).toBe('trabajador')
    expect(slugify('   ')).toBe('trabajador')
  })
})

describe('uniqueSlug', () => {
  it('devuelve la base cuando está libre', () => {
    expect(uniqueSlug('juan-perez', new Set())).toBe('juan-perez')
  })

  it('añade sufijo -2 cuando la base está tomada', () => {
    expect(uniqueSlug('juan-perez', new Set(['juan-perez']))).toBe('juan-perez-2')
  })

  it('incrementa el sufijo hasta encontrar uno libre', () => {
    expect(uniqueSlug('juan-perez', new Set(['juan-perez', 'juan-perez-2']))).toBe('juan-perez-3')
  })
})
