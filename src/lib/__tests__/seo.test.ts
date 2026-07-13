import { describe, expect, it } from 'vitest'
import { CATEGORY_SEO, categoryFromSlug, categoryPath } from '@/lib/seo'
import { CATEGORY_KEYS } from '@/lib/categories'

describe('CATEGORY_SEO', () => {
  it('covers every category with slug, plural and description', () => {
    for (const category of CATEGORY_KEYS) {
      const seo = CATEGORY_SEO[category]
      expect(seo.slug).toMatch(/^[a-z0-9-]+$/)
      expect(seo.plural.length).toBeGreaterThan(0)
      expect(seo.description.length).toBeGreaterThan(50)
    }
  })

  it('has unique slugs', () => {
    const slugs = CATEGORY_KEYS.map((c) => CATEGORY_SEO[c].slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('categoryFromSlug', () => {
  it('round-trips every category through its slug', () => {
    for (const category of CATEGORY_KEYS) {
      expect(categoryFromSlug(CATEGORY_SEO[category].slug)).toBe(category)
    }
  })

  it('rejects unknown or malicious slugs', () => {
    expect(categoryFromSlug('no-existe')).toBeNull()
    expect(categoryFromSlug('')).toBeNull()
    expect(categoryFromSlug('MASONRY')).toBeNull()
    expect(categoryFromSlug('__proto__')).toBeNull()
  })
})

describe('categoryPath', () => {
  it('builds the public route for a category', () => {
    expect(categoryPath('MASONRY')).toBe('/servicios/albanil')
    expect(categoryPath('ELECTRICAL')).toBe('/servicios/electricista')
    expect(categoryPath('PLUMBING')).toBe('/servicios/fontanero')
  })
})
