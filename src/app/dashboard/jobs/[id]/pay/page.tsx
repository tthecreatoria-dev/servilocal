import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { calculateCommission } from '@/lib/commission'
import Link from 'next/link'

export default async function PayJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tkieroPaymentId?: string; error?: string }>
}) {
  const { id } = await params
  const { tkieroPaymentId, error } = await searchParams

  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  const job = await db.jobPost.findUnique({
    where: { id },
    select: { id: true, title: true, budget: true, status: true, clientId: true, category: true },
  })
  if (!job) notFound()
  if (job.clientId !== session.user.id) redirect('/dashboard/jobs')
  if (job.status !== 'PENDING_PAYMENT') redirect(`/dashboard/jobs/${id}`)

  const budget = Number(job.budget)
  const { commissionAmount: fee, rate: commissionRate } = calculateCommission(budget, job.category)

  // Load QR URL from JobPayment if tkieroPaymentId param is present
  let qrCodeUrl: string | null = null
  if (tkieroPaymentId) {
    const jobPayment = await db.jobPayment.findUnique({
      where: { jobPostId: id },
      select: { qrCodeUrl: true },
    })
    qrCodeUrl = jobPayment?.qrCodeUrl ?? null
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 mb-6 shadow-sm">
        <p className="text-label-sm text-on-surface-variant mb-1">Completar pago para</p>
        <h1 className="text-headline-lg-mobile text-primary mb-4">{job.title}</h1>

        <div className="border-t border-outline-variant pt-4 space-y-2">
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Presupuesto del proyecto</span>
            <span className="text-on-surface font-medium">${budget.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Comisión de plataforma ({(commissionRate * 100).toFixed(0)}%)</span>
            <span className="text-on-surface font-medium">−${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-label-md text-on-surface border-t border-outline-variant pt-2 mt-2">
            <span>Total a pagar ahora</span>
            <span className="text-primary text-headline-md">${budget.toFixed(2)}</span>
          </div>
          <p className="text-label-sm text-on-surface-variant/70">
            El proveedor recibirá ${(budget - fee).toFixed(2)} al completar el trabajo. La comisión cubre la administración y custodia del pago.
          </p>
        </div>
      </div>

      {/* Payment methods */}
      <p className="text-label-md text-on-surface-variant mb-4">Elige cómo pagar</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Tkiero QR */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-primary text-[24px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              qr_code_scanner
            </span>
            <span className="text-label-md text-on-surface">Tkiero QR</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-4">
            {qrCodeUrl ? (
              <>
                <img
                  src={qrCodeUrl}
                  alt="Tkiero QR de pago"
                  className="w-44 h-44 rounded-xl border border-outline-variant"
                />
                <p className="text-label-sm text-on-surface-variant text-center mt-3">
                  Monto: <strong className="text-on-surface">${budget.toFixed(2)}</strong>
                </p>
                <p className="text-label-sm text-on-surface-variant/60 text-center mt-1">
                  Escanea con tu app de Tkiero. El proyecto se activará automáticamente al confirmar el pago.
                </p>
              </>
            ) : (
              <>
                <div className="w-44 h-44 bg-surface-container border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-outline text-[64px]">qr_code_2</span>
                </div>
                <p className="text-label-sm text-on-surface-variant/60 text-center mt-1">
                  Genera el QR para ver el monto y escanear con tu app de Tkiero
                </p>
                <a
                  href={`/api/payments/tkiero/create?jobId=${id}`}
                  className="btn-press mt-4 w-full bg-primary text-on-primary py-3 rounded-full text-label-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
                  Generar QR
                </a>
              </>
            )}
          </div>
        </div>

        {/* PayPal */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-primary text-[24px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              credit_card
            </span>
            <span className="text-label-md text-on-surface">PayPal</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-16 h-16 bg-[#003087] rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl" style={{ fontFamily: 'Arial, sans-serif' }}>P</span>
            </div>
            <p className="text-body-md text-on-surface-variant text-center">
              Serás redirigido a PayPal para completar el pago de forma segura.
            </p>
            <p className="text-label-sm text-on-surface-variant/60 text-center">
              Acepta tarjeta de crédito, débito y saldo PayPal
            </p>
            {error === 'paypal_failed' && (
              <p className="text-label-sm text-error text-center">
                El pago con PayPal no se completó. Por favor intenta de nuevo.
              </p>
            )}
          </div>

          <a
            href={`/api/payments/paypal/create-order?jobId=${id}`}
            className="btn-press mt-4 w-full bg-[#0070ba] text-white py-3 rounded-full text-label-md hover:bg-[#003087] transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
            Pagar con PayPal
          </a>
        </div>

      </div>

      <p className="text-label-sm text-on-surface-variant/60 text-center mt-6">
        Tu pago quedará en custodia hasta que confirmes que el trabajo fue completado.
      </p>
    </div>
  )
}
