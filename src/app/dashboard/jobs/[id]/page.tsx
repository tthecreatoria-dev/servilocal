import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_LABELS } from '@/lib/categories'
import { SelectApplicationButton } from './select-application-button'
import { CompleteJobButton } from './complete-job-button'

const STATUS_CONFIG = {
  PENDING_PAYMENT: { label: 'Pago pendiente', className: 'bg-primary-container text-on-primary-container' },
  OPEN:            { label: 'Abierto',         className: 'bg-surface-container text-on-surface-variant' },
  ASSIGNED:        { label: 'Asignado',         className: 'bg-surface-container text-on-surface-variant' },
  IN_PROGRESS:     { label: 'En progreso',      className: 'bg-surface-container text-secondary' },
  COMPLETED:       { label: 'Completado',       className: 'bg-surface-container text-secondary' },
  CANCELLED:       { label: 'Cancelado',        className: 'bg-surface-container text-on-surface-variant opacity-60' },
} as const

const APPLICATION_STATUS_LABELS = {
  PENDING:  'En revisión',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
} as const

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  const job = await db.jobPost.findUnique({
    where: { id },
    include: {
      applications: {
        include: { provider: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!job) notFound()
  if (job.clientId !== session.user.id) redirect('/dashboard/jobs')

  const category = job.category as ServiceCategory
  const statusCfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.OPEN

  return (
    <div className="motion-section max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="motion-interactive inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      <div className="motion-surface bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="motion-reveal text-headline-lg-mobile text-primary">{job.title}</h1>
          <span className={`text-label-sm px-2.5 py-1 rounded-full shrink-0 ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-4 text-label-sm text-on-surface-variant mb-4">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">category</span>
            {CATEGORY_LABELS[category] ?? job.category}
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

        {job.status === 'IN_PROGRESS' && (
          <div className="mb-4">
            <CompleteJobButton jobPostId={job.id} />
          </div>
        )}

        <p className="text-body-md text-on-surface-variant border-t border-outline-variant pt-4">
          {job.description}
        </p>
      </div>

      <h2 className="motion-reveal text-headline-md text-on-surface mb-4">
        Propuestas recibidas ({job.applications.length})
      </h2>

      {job.applications.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Ningún proveedor ha aplicado aún.</p>
      ) : (
        <ul className="motion-list space-y-4">
          {job.applications.map((app) => (
            <li
              key={app.id}
              className="motion-list-item motion-surface bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-label-md text-on-surface">{app.provider.name}</p>
                  <p className="text-body-md text-on-surface-variant mt-1">{app.message}</p>
                  <p className="text-label-md text-on-surface font-semibold mt-2">
                    ${Number(app.proposedPrice).toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-label-sm text-on-surface-variant">
                    {APPLICATION_STATUS_LABELS[app.status as keyof typeof APPLICATION_STATUS_LABELS] ?? app.status}
                  </span>
                  {job.status === 'OPEN' && app.status === 'PENDING' && (
                    <SelectApplicationButton jobPostId={job.id} applicationId={app.id} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
