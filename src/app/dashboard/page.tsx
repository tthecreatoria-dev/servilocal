import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  let pendingPayoutTotal = 0
  let needsPayoutSetup = false

  if (session.user.role === 'PROVIDER') {
    const profile = await db.providerProfile.findUnique({
      where: { userId: session.user.id },
      select: { payoutMethod: true },
    })
    const pending = await db.jobPayment.findMany({
      where: {
        status: 'PENDING_PAYOUT',
        jobPost: {
          applications: { some: { status: 'ACCEPTED', providerId: session.user.id } },
        },
      },
      include: { commission: true },
    })
    pendingPayoutTotal = pending.reduce(
      (sum, p) => sum + Number(p.amount) - Number(p.commission?.amount ?? 0),
      0,
    )
    needsPayoutSetup = !profile?.payoutMethod && pending.length > 0
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>

      {needsPayoutSetup && (
        <div className="mt-4 flex items-center gap-3 bg-primary-container text-on-primary-container rounded-xl px-4 py-3">
          <span className="material-symbols-outlined">account_balance_wallet</span>
          <p className="text-label-md flex-1">
            Tienes ${pendingPayoutTotal.toFixed(2)} de trabajos completados esperando.
            Configura tu método de cobro para recibirlos.
          </p>
          <Link
            href="/dashboard/profile"
            className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md shrink-0"
          >
            Configurar
          </Link>
        </div>
      )}

      <p className="mt-2 text-zinc-500">Dashboard features coming soon.</p>
    </div>
  )
}
