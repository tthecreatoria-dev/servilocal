'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeJob } from '@/actions/jobs'

export function CompleteJobButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleComplete() {
    if (!confirm('¿El trabajo está terminado a tu satisfacción? Esto inicia la liquidación al proveedor.')) return
    setPending(true)
    const result = await completeJob({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al completar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleComplete}
      disabled={pending}
      className="motion-interactive btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Completando...' : 'Marcar como completado'}
    </button>
  )
}
