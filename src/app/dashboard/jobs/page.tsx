import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const STATUS_CONFIG = {
  PENDING_PAYMENT: { label: 'Pago pendiente', className: 'bg-primary-container text-on-primary-container' },
  OPEN:            { label: 'Abierto',         className: 'bg-surface-container text-on-surface-variant' },
  ASSIGNED:        { label: 'Asignado',         className: 'bg-surface-container text-on-surface-variant' },
  IN_PROGRESS:     { label: 'En progreso',      className: 'bg-surface-container text-on-surface-variant' },
  COMPLETED:       { label: 'Completado',       className: 'bg-surface-container text-secondary' },
  CANCELLED:       { label: 'Cancelado',        className: 'bg-surface-container text-on-surface-variant opacity-60' },
} as const

export default async function DashboardJobsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  const jobs = await db.jobPost.findMany({
    where: { clientId: session.user.id },
    include: { _count: { select: { applications: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-headline-lg-mobile text-primary">Mis proyectos</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {jobs.length} proyecto{jobs.length !== 1 ? 's' : ''} publicado{jobs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/jobs/new"
          className="btn-press bg-primary text-on-primary px-5 py-2.5 rounded-full text-label-md hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
          Nuevo
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-10 flex flex-col items-center text-center gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">work_off</span>
          <p className="text-headline-md text-on-surface-variant">Aún no has publicado proyectos</p>
          <Link
            href="/dashboard/jobs/new"
            className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Publicar primer proyecto
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const statusCfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.OPEN
            const isPendingPayment = job.status === 'PENDING_PAYMENT'
            const category = job.category as ServiceCategory

            return (
              <li
                key={job.id}
                className={`bg-surface-container-lowest border rounded-2xl p-5 shadow-sm transition-colors ${
                  isPendingPayment ? 'border-primary/40' : 'border-outline-variant'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={isPendingPayment ? `/dashboard/jobs/${job.id}/pay` : `/dashboard/jobs/${job.id}`}
                      className="text-label-md text-on-surface hover:text-primary transition-colors line-clamp-1"
                    >
                      {job.title}
                    </Link>
                    <p className="text-label-sm text-on-surface-variant mt-1">
                      {CATEGORY_LABELS[category] ?? job.category} · {new Date(job.deadline).toLocaleDateString('es-SV')}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-label-sm px-2.5 py-1 rounded-full ${statusCfg.className}`}>
                      {statusCfg.label}
                    </span>
                    {!isPendingPayment && (
                      <span className="text-label-sm text-on-surface-variant">
                        {job._count.applications} propuesta{job._count.applications !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pending payment CTA */}
                {isPendingPayment && (
                  <div className="mt-3 pt-3 border-t border-outline-variant flex items-center justify-between">
                    <p className="text-label-sm text-on-surface-variant">
                      Completa el pago para activar este proyecto
                    </p>
                    <Link
                      href={`/dashboard/jobs/${job.id}/pay`}
                      className="btn-press inline-flex items-center gap-1 bg-primary text-on-primary px-4 py-1.5 rounded-full text-label-sm hover:opacity-90 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        payments
                      </span>
                      Pagar ahora
                    </Link>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
