import type { MetadataRoute } from 'next'
import { appUrl } from '@/lib/seo'

// /login y /register no se bloquean aquí: llevan noindex en su metadata, y
// si robots los bloqueara Google no podría leer esa directiva.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/'],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  }
}
