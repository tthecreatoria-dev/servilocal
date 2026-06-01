import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import { SelectApplicationButton } from './select-application-button'

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

  return (
    <div>
      <Link href="/dashboard/jobs" className="text-sm text-zinc-500 hover:underline mb-4 block">
        ← Mis proyectos
      </Link>
      <h1 className="text-2xl font-semibold mb-2">{job.title}</h1>
      <p className="text-zinc-500 text-sm mb-2">
        {job.category} · Presupuesto: ${job.budget.toString()} · Deadline:{' '}
        {new Date(job.deadline).toLocaleDateString('es-SV')}
      </p>
      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 mb-4">
        {job.status}
      </span>
      <p className="text-zinc-700 mb-8">{job.description}</p>

      <h2 className="text-lg font-semibold mb-4">
        Propuestas recibidas ({job.applications.length})
      </h2>
      {job.applications.length === 0 ? (
        <p className="text-zinc-500">Ningún proveedor ha aplicado aún.</p>
      ) : (
        <ul className="space-y-4">
          {job.applications.map((app) => (
            <li key={app.id} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{app.provider.name}</p>
                  <p className="text-sm text-zinc-600 mt-1">{app.message}</p>
                  <p className="text-sm font-semibold mt-2">
                    ${app.proposedPrice.toString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 ml-4">
                  <span className="text-xs text-zinc-400">{app.status}</span>
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
