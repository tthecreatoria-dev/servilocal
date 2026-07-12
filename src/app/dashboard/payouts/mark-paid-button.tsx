'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markPayoutPaid } from '@/actions/payouts'

export function MarkPaidButton({ jobPaymentId }: { jobPaymentId: string }) {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState(false)

  async function handlePaid() {
    if (!confirm('¿Confirmas que ya enviaste el dinero al proveedor?')) return
    setPending(true)
    const result = await markPayoutPaid({
      jobPaymentId,
      reference: reference.trim() || undefined,
    })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al liquidar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Referencia (opcional)"
        className="motion-field border border-outline-variant rounded-lg px-3 py-1.5 text-label-md bg-surface-container-lowest focus:outline-none focus:border-primary"
      />
      <button
        onClick={handlePaid}
        disabled={pending}
        className="motion-interactive btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Liquidando...' : 'Marcar como pagado'}
      </button>
    </div>
  )
}
