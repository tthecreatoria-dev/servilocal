'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { declineInvitation } from '@/actions/jobs'

const ERROR_LABELS: Record<string, string> = {
  not_invited:     'Esta invitación ya no está dirigida a ti.',
  post_not_open:   'Este proyecto ya no está abierto.',
  already_applied: 'Ya enviaste una propuesta a este proyecto.',
  post_not_found:  'El proyecto ya no existe.',
}

export function DeclineInvitationButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDecline() {
    if (!confirm('¿Rechazar esta invitación? El proyecto pasará al listado público y otros proveedores podrán aplicar.')) return
    setPending(true)
    const result = await declineInvitation({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(ERROR_LABELS[result.error] ?? `Error: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleDecline}
      disabled={pending}
      className="btn-press border border-outline-variant bg-surface-container-lowest text-on-surface-variant px-4 py-2 rounded-full text-label-sm hover:bg-surface-container transition-colors disabled:opacity-50"
    >
      {pending ? 'Rechazando…' : 'Rechazar'}
    </button>
  )
}
