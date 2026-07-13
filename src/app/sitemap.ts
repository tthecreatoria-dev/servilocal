import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { CATEGORY_KEYS } from '@/lib/categories'
import { appUrl, categoryPath } from '@/lib/seo'

// Sin esto el sitemap se prerenderiza en build y los perfiles/trabajos
// quedan congelados en ese snapshot.
export const dynamic = 'force-dynamic'

// Los try/catch permiten generar un sitemap parcial (rutas estáticas y de
// categoría) cuando la DB no está disponible, p. ej. durante el build.
async function getProviderEntries(base: string): Promise<MetadataRoute.Sitemap> {
  try {
    const profiles = await db.providerProfile.findMany({
      select: { slug: true, updatedAt: true },
    })
    return profiles.map((profile) => ({
      url: `${base}/providers/${profile.slug}`,
      lastModified: profile.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))
  } catch (e) {
    console.error('[sitemap] providers', e)
    return []
  }
}

async function getOpenJobEntries(base: string): Promise<MetadataRoute.Sitemap> {
  try {
    const jobs = await db.jobPost.findMany({
      where: { status: 'OPEN', invitedProviderId: null },
      select: { id: true, updatedAt: true },
    })
    return jobs.map((job) => ({
      url: `${base}/jobs/${job.id}`,
      lastModified: job.updatedAt,
      changeFrequency: 'daily',
      priority: 0.6,
    }))
  } catch (e) {
    console.error('[sitemap] jobs', e)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/providers`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/jobs`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.4 },
  ]

  const categoryEntries: MetadataRoute.Sitemap = CATEGORY_KEYS.map((category) => ({
    url: `${base}${categoryPath(category)}`,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  const [providerEntries, jobEntries] = await Promise.all([
    getProviderEntries(base),
    getOpenJobEntries(base),
  ])

  return [...staticEntries, ...categoryEntries, ...providerEntries, ...jobEntries]
}
