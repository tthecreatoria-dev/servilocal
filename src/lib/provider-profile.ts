import { cache } from 'react'
import { db } from '@/lib/db'
import type { ServiceCategory } from '@/types/index'

export type PublicProviderService = {
  id: string
  title: string
  description: string
  price: number
  category: ServiceCategory
}

export type PublicProviderProfile = {
  slug: string
  name: string
  bio: string
  skills: ServiceCategory[]
  rating: number
  totalReviews: number
  isRemote: boolean
  address: string | null
  services: PublicProviderService[]
  /** Solo no-null cuando el proveedor activó showPhone. */
  phone: string | null
}

// Regla dura de privacidad: el teléfono jamás entra en el select principal.
// Solo se consulta en un segundo paso cuando el proveedor activó showPhone.
export const getPublicProviderProfile = cache(
  async (slug: string): Promise<PublicProviderProfile | null> => {
    const profile = await db.providerProfile.findUnique({
      where: { slug },
      select: {
        userId: true,
        slug: true,
        bio: true,
        skills: true,
        rating: true,
        totalReviews: true,
        isRemote: true,
        address: true,
        showPhone: true,
        user: { select: { name: true } },
        services: {
          where: { isActive: true },
          select: { id: true, title: true, description: true, price: true, category: true },
        },
      },
    })
    if (!profile) return null

    let phone: string | null = null
    if (profile.showPhone) {
      const user = await db.user.findUnique({
        where: { id: profile.userId },
        select: { phone: true },
      })
      phone = user?.phone ?? null
    }

    return {
      slug: profile.slug,
      name: profile.user.name,
      bio: profile.bio,
      skills: profile.skills as ServiceCategory[],
      rating: profile.rating,
      totalReviews: profile.totalReviews,
      isRemote: profile.isRemote,
      address: profile.address,
      services: profile.services.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        price: Number(s.price),
        category: s.category as ServiceCategory,
      })),
      phone,
    }
  },
)
