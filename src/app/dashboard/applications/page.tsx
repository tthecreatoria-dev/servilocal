import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types/index'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const STATUS_CONFIG = {
  PENDING:  { label: 'En revisión', icon: 'hourglass_empty', className: 'bg-surface-container text-on-surface-variant' },
  ACCEPTED: { label: 'Aceptada',    icon: 'check_circle',    className: 'bg-primary-container text-on-primary-container' },
  REJECTED: { label: 'Rechazada',   icon: 'cancel',          className: 'bg-surface-container text-on-surface-variant opacity-60' },
} as const

export default async function ProviderApplicationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'PROVIDER') redirect('/dashboard')

  const applications = await db.jobApplication.findMany({
    where: { providerId: session.user.id },
    include: {
      jobPost: {
        select: {
          id:       true,
          title:    true,
          category: true,
          budget:   true,
          status:   true,
          deadline: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile text-primary">Mis propuestas</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Proyectos a los que has aplicado.
        </p>
      </div>

      {applications.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-10 flex flex-col items-center text-center gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">description</span>
          <p className="text-headline-md text-on-surface-variant">Aún no has enviado propuestas</p>
          <p className="text-body-md text-on-surface-variant max-w-xs">
            Explora los proyectos disponibles y aplica a los que coincidan con tu categoría.
          </p>
          <Link
            href="/"
            className="btn-press mt-2 bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Ver proyectos
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {applications.map((app) => {
            const job    = app.jobPost
            const status = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG]
            const category = job.category as ServiceCategory

            return (
              <li
                key={app.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-headline-md text-on-surface hover:text-primary transition-colors line-clamp-2 flex-1"
                  >
                    {job.title}
                  </Link>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-sm shrink-0 ${status.className}`}>
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {status.icon}
                    </span>
                    {status.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-label-sm text-on-surface-variant mb-4">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">category</span>
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">payments</span>
                    Presupuesto: <strong className="text-on-surface">${Number(job.budget).toFixed(2)}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">calendar_month</span>
                    Deadline: {new Date(job.deadline).toLocaleDateString('es-SV')}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
                  <span className="text-label-sm text-on-surface-variant">
                    Tu propuesta:{' '}
                    <strong className="text-on-surface text-body-md">
                      ${Number(app.proposedPrice).toFixed(2)}
                    </strong>
                  </span>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="btn-press inline-flex items-center gap-1 text-label-sm text-primary hover:underline"
                  >
                    Ver proyecto
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
