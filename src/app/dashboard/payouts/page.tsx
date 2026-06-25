import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MarkPaidButton } from './mark-paid-button'

export default async function PayoutsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const payments = await db.jobPayment.findMany({
    where: { status: 'PENDING_PAYOUT' },
    include: {
      commission: true,
      jobPost: {
        select: {
          title: true,
          applications: {
            where: { status: 'ACCEPTED' },
            select: {
              provider: {
                select: {
                  name: true,
                  providerProfile: {
                    select: { payoutMethod: true, paypalEmail: true, tkieroAccount: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'asc' },
  })

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile text-primary">Liquidaciones pendientes</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Pagos retenidos de trabajos completados, listos para enviar al proveedor.
        </p>
      </div>

      {payments.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No hay liquidaciones pendientes.</p>
      ) : (
        <ul className="space-y-4">
          {payments.map((p) => {
            const provider = p.jobPost.applications[0]?.provider
            const profile = provider?.providerProfile
            const destination =
              profile?.payoutMethod === 'PAYPAL' ? profile.paypalEmail
              : profile?.payoutMethod === 'TKIERO' ? profile.tkieroAccount
              : null
            const gross = Number(p.amount)
            const fee = Number(p.commission?.amount ?? 0)
            return (
              <li key={p.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <p className="text-body-md font-medium text-on-surface">{p.jobPost.title}</p>
                    <p className="text-label-md text-on-surface-variant mt-1">
                      Proveedor: {provider?.name ?? '—'}
                    </p>
                    <p className="text-label-md text-on-surface-variant">
                      Bruto ${gross.toFixed(2)} · Comisión ${fee.toFixed(2)} ·{' '}
                      <span className="font-semibold text-on-surface">Neto ${(gross - fee).toFixed(2)}</span>
                    </p>
                    <p className="text-label-md text-on-surface-variant mt-1">
                      {destination
                        ? `${profile?.payoutMethod === 'PAYPAL' ? 'PayPal' : 'Tkiero'}: ${destination}`
                        : null}
                    </p>
                  </div>
                  {destination ? (
                    <MarkPaidButton jobPaymentId={p.id} />
                  ) : (
                    <span className="text-label-md bg-surface-container text-on-surface-variant px-3 py-1.5 rounded-full">
                      Bloqueado — sin destino de pago
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
