import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseCategoryParam } from '@/lib/categories'
import { NewJobForm } from './new-job-form'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const initialCategory = parseCategoryParam((await searchParams).category)

  const session = await auth()
  if (!session) {
    const callbackUrl = initialCategory
      ? `/dashboard/jobs/new?category=${initialCategory}`
      : '/dashboard/jobs/new'
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-headline-lg-mobile text-primary">Publicar proyecto</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Describe lo que necesitas y recibe propuestas de proveedores locales.
          </p>
        </div>
        <NewJobForm initialCategory={initialCategory} />
      </div>
    </div>
  )
}
