import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseCategoryParam } from '@/lib/categories'
import { NewJobForm } from './new-job-form'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; invite?: string }>
}) {
  const { category, invite } = await searchParams
  const initialCategory = parseCategoryParam(category)

  const session = await auth()
  if (!session) {
    const params = new URLSearchParams()
    if (initialCategory) params.set('category', initialCategory)
    if (invite) params.set('invite', invite)
    const qs = params.toString()
    const callbackUrl = qs ? `/dashboard/jobs/new?${qs}` : '/dashboard/jobs/new'
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  // Un slug inválido degrada a post público sin invitación — no es un error.
  let invitedProvider: { id: string; name: string } | null = null
  if (invite) {
    const profile = await db.providerProfile.findUnique({
      where: { slug: invite },
      select: { userId: true, user: { select: { name: true } } },
    })
    if (profile) invitedProvider = { id: profile.userId, name: profile.user.name }
  }

  return (
    <div className="motion-section max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="motion-interactive inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      <div className="motion-surface bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="motion-reveal text-headline-lg-mobile text-primary">
            {invitedProvider ? `Contratar a ${invitedProvider.name}` : 'Publicar proyecto'}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {invitedProvider
              ? 'Describe el trabajo que necesitas. Solo esta persona verá tu proyecto y podrá enviarte su propuesta.'
              : 'Describe lo que necesitas y recibe propuestas de proveedores locales.'}
          </p>
        </div>
        {invitedProvider && (
          <div className="flex items-start gap-3 bg-primary-container border border-primary/30 rounded-xl px-4 py-3 mb-7">
            <span
              className="material-symbols-outlined text-on-primary-container text-[20px] mt-0.5 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              mail
            </span>
            <p className="text-on-primary-container text-label-md">
              Estás invitando a <strong>{invitedProvider.name}</strong>. El proyecto no aparecerá
              en el listado público mientras la invitación esté activa.
            </p>
          </div>
        )}
        <NewJobForm initialCategory={initialCategory} invitedProviderId={invitedProvider?.id ?? null} />
      </div>
    </div>
  )
}
