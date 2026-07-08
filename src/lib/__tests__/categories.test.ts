import { describe, it, expect } from 'vitest'
import { parseCategoryParam } from '@/lib/categories'

describe('parseCategoryParam', () => {
  it('acepta categorías canónicas', () => {
    expect(parseCategoryParam('PLUMBING')).toBe('PLUMBING')
    expect(parseCategoryParam('DESIGN')).toBe('DESIGN')
  })

  it('rechaza valores desconocidos', () => {
    expect(parseCategoryParam('BOGUS')).toBe(null)
  })

  it('rechaza undefined y variantes en minúsculas', () => {
    expect(parseCategoryParam(undefined)).toBe(null)
    expect(parseCategoryParam('plumbing')).toBe(null)
  })
})
