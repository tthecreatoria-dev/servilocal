import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ApplyForm } from './apply-form'
import type { ServiceCategory } from '@/types/index'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const CATEGORY_ICONS: Record<ServiceCategory, string> = {
  PLUMBING: 'plumbing',
  TEACHING: 'school',
  DELIVERY: 'local_shipping',
  CLEANING: 'cleaning_services',
  DESIGN:   'palette',
  DIGITAL:  'computer',
}

export default async function MarketplaceJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()

  const job = await db.jobPost.findUnique({
    where: { id },
    include: { client: { select: { name: true } } },
  })
  if (!job) notFound()

  // Fetch provider-specific data only when needed
  let providerProfile: { skills: string[] } | null = null
  let existingApplication: { status: string; proposedPrice: unknown; message: string } | null = null

  if (session?.user.role === 'PROVIDER') {
    ;[providerProfile, existingApplication] = await Promise.all([
      db.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { skills: true },
      }),
      db.jobApplication.findUnique({
        where: { jobPostId_providerId: { jobPostId: id, providerId: session.user.id } },
        select: { status: true, proposedPrice: true, message: true },
      }),
    ])
  }

  // ---- Determine what to show in the action area ----
  type ActionState =
    | 'unauthenticated'
    | 'owner'
    | 'client-not-owner'
    | 'provider-wrong-category'
    | 'provider-already-applied'
    | 'job-closed'
    | 'can-apply'

  let actionState: ActionState

  if (!session) {
    actionState = 'unauthenticated'
  } else if (session.user.role === 'CLIENT') {
    actionState = job.clientId === session.user.id ? 'owner' : 'client-not-owner'
  } else {
    // PROVIDER — check existing application first so status is always visible
    if (existingApplication) {
      actionState = 'provider-already-applied'
    } else if (job.status !== 'OPEN') {
      actionState = 'job-closed'
    } else if (providerProfile && !providerProfile.skills.includes(job.category)) {
      actionState = 'provider-wrong-category'
    } else {
      actionState = 'can-apply'
    }
  }

  const category = job.category as ServiceCategory

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Proyectos disponibles
      </Link>

      {/* Job card */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        {/* Category + status */}
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">
              {CATEGORY_ICONS[category]}
            </span>
            {CATEGORY_LABELS[category]}
          </span>
          {job.status !== 'OPEN' && (
            <span className="text-label-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
              Cerrado
            </span>
          )}
        </div>

        <h1 className="text-headline-lg-mobile text-primary mb-3">{job.title}</h1>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 text-label-sm text-on-surface-variant mb-6">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">payments</span>
            Presupuesto: <strong className="text-on-surface">${Number(job.budget).toFixed(2)}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">calendar_month</span>
            Deadline: <strong className="text-on-surface">{new Date(job.deadline).toLocaleDateString('es-SV')}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">person</span>
            Publicado por <strong className="text-on-surface">{job.client.name}</strong>
          </span>
        </div>

        <p className="text-body-md text-on-surface leading-relaxed">{job.description}</p>
      </div>

      {/* Action area */}
      {actionState === 'unauthenticated' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-3 mb-5">
            <span
              className="material-symbols-outlined text-primary text-[28px] mt-0.5 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              work
            </span>
            <div>
              <p className="text-label-md text-on-surface">¿Eres proveedor de {CATEGORY_LABELS[category]}?</p>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                Inicia sesión con tu cuenta de proveedor para enviar una propuesta.
              </p>
            </div>
          </div>
          <Link
            href={`/login?callbackUrl=/jobs/${id}`}
            className="btn-press inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary py-3.5 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              login
            </span>
            Iniciar sesión para aplicar
          </Link>
        </div>
      )}

      {actionState === 'owner' && (
        <div className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-5">
          <span
            className="material-symbols-outlined text-secondary text-[24px] mt-0.5 shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified
          </span>
          <div>
            <p className="text-label-md text-on-surface">Este es tu proyecto</p>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Puedes ver las propuestas recibidas en tu{' '}
              <Link href={`/dashboard/jobs/${job.id}`} className="text-primary hover:underline">
                panel de control
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {actionState === 'client-not-owner' && (
        <div className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-5">
          <span className="material-symbols-outlined text-on-surface-variant text-[24px] mt-0.5 shrink-0">
            info
          </span>
          <p className="text-body-md text-on-surface-variant">
            Solo los proveedores pueden enviar propuestas a proyectos.
          </p>
        </div>
      )}

      {actionState === 'job-closed' && (
        <div className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-5">
          <span className="material-symbols-outlined text-on-surface-variant text-[24px] mt-0.5 shrink-0">
            lock
          </span>
          <p className="text-body-md text-on-surface-variant">
            Este proyecto ya no está disponible para propuestas.
          </p>
        </div>
      )}

      {actionState === 'provider-wrong-category' && (
        <div className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-5">
          <span className="material-symbols-outlined text-on-surface-variant text-[24px] mt-0.5 shrink-0">
            do_not_disturb
          </span>
          <p className="text-body-md text-on-surface-variant">
            Este proyecto requiere <strong className="text-on-surface">{CATEGORY_LABELS[category]}</strong>.
            Tus habilidades registradas no incluyen esa categoría.
          </p>
        </div>
      )}

      {actionState === 'provider-already-applied' && existingApplication && (() => {
        const s = existingApplication.status
        const configs = {
          PENDING: {
            icon:        'hourglass_empty',
            iconClass:   'text-on-surface-variant',
            wrapClass:   'bg-surface-container border-outline-variant',
            title:       'Propuesta en revisión',
            description: 'El cliente aún no ha tomado una decisión. Te notificaremos cuando haya una respuesta.',
          },
          ACCEPTED: {
            icon:        'check_circle',
            iconClass:   'text-secondary',
            wrapClass:   'bg-primary-container border-primary/30',
            title:       '¡Tu propuesta fue aceptada!',
            description: 'El cliente te seleccionó para este proyecto. Espera instrucciones para coordinar el trabajo.',
          },
          REJECTED: {
            icon:        'cancel',
            iconClass:   'text-on-surface-variant',
            wrapClass:   'bg-surface-container border-outline-variant opacity-75',
            title:       'Propuesta no seleccionada',
            description: 'El cliente eligió otra propuesta para este proyecto.',
          },
        } as const
        const cfg = configs[s as keyof typeof configs] ?? configs.PENDING

        return (
          <div className={`border rounded-2xl p-6 ${cfg.wrapClass}`}>
            <div className="flex items-start gap-3 mb-4">
              <span
                className={`material-symbols-outlined text-[28px] mt-0.5 shrink-0 ${cfg.iconClass}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {cfg.icon}
              </span>
              <div>
                <p className="text-label-md text-on-surface">{cfg.title}</p>
                <p className="text-body-md text-on-surface-variant mt-0.5">{cfg.description}</p>
              </div>
            </div>
            <div className="border-t border-outline-variant pt-4 flex flex-wrap gap-4 text-label-sm text-on-surface-variant">
              <span>
                Tu precio propuesto:{' '}
                <strong className="text-on-surface">
                  ${Number(existingApplication.proposedPrice).toFixed(2)}
                </strong>
              </span>
              <span className="line-clamp-1 flex-1">
                Mensaje: <em className="text-on-surface">{existingApplication.message}</em>
              </span>
            </div>
          </div>
        )
      })()}

      {actionState === 'can-apply' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
          <h2 className="text-headline-md text-on-surface mb-6">Enviar propuesta</h2>
          <ApplyForm jobPostId={id} budget={Number(job.budget)} />
        </div>
      )}
    </div>
  )
}
