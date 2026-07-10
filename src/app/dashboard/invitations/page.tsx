import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/lib/categories'
import { DeclineInvitationButton } from './decline-invitation-button'

export default async function ProviderInvitationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'PROVIDER') redirect('/dashboard')

  const invitations = await db.jobPost.findMany({
    where: {
      invitedProviderId: session.user.id,
      status: 'OPEN',
      applications: { none: { providerId: session.user.id } },
    },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile text-primary">Invitaciones</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Clientes que te eligieron directamente para su proyecto.
        </p>
      </div>

      {invitations.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">mail</span>
          <p className="text-headline-md text-on-surface-variant">No tienes invitaciones pendientes</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            Cuando un cliente te contrate desde tu perfil, su invitación aparecerá aquí.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {invitations.map((job) => {
            const cat = job.category as ServiceCategory
            return (
              <li
                key={job.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">{CATEGORY_ICONS[cat]}</span>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">
                    {new Date(job.deadline).toLocaleDateString('es-SV')}
                  </span>
                </div>

                <h2 className="text-label-md text-on-surface mb-1">{job.title}</h2>
                <p className="text-body-md text-on-surface-variant line-clamp-2 mb-4">{job.description}</p>

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
                  <div>
                    <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      {job.client.name}
                    </p>
                    <p className="text-label-md text-primary font-bold mt-0.5">
                      ${Number(job.budget).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DeclineInvitationButton jobPostId={job.id} />
                    <Link
                      href={`/jobs/${job.id}`}
                      className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-sm hover:opacity-90 transition-opacity"
                    >
                      Ver y aplicar
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
