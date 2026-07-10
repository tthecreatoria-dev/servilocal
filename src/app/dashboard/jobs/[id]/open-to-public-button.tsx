'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { openJobToPublic } from '@/actions/jobs'

const ERROR_LABELS: Record<string, string> = {
  post_not_owned: 'Este proyecto no te pertenece.',
  post_not_open:  'El proyecto ya no está abierto.',
  no_invitation:  'Este proyecto ya es público.',
  post_not_found: 'El proyecto ya no existe.',
}

export function OpenToPublicButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleOpen() {
    if (!confirm('¿Abrir este proyecto al público? La invitación se cancela y cualquier proveedor podrá enviar propuestas.')) return
    setPending(true)
    const result = await openJobToPublic({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(ERROR_LABELS[result.error] ?? `Error: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={pending}
      className="btn-press border border-outline-variant bg-surface-container-lowest text-on-surface px-4 py-2 rounded-full text-label-sm hover:bg-surface-container transition-colors disabled:opacity-50"
    >
      {pending ? 'Abriendo…' : 'Abrir al público'}
    </button>
  )
}
