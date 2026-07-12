'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startJob } from '@/actions/jobs'

export function StartJobButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleStart() {
    setPending(true)
    const result = await startJob({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al iniciar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={pending}
      className="motion-interactive btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Iniciando...' : 'Iniciar trabajo'}
    </button>
  )
}
