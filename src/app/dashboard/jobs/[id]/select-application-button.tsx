'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { selectJobApplication } from '@/actions/jobs'

export function SelectApplicationButton({
  jobPostId,
  applicationId,
}: {
  jobPostId: string
  applicationId: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSelect() {
    setPending(true)
    const result = await selectJobApplication({ jobPostId, applicationId })
    if (result.success) {
      router.refresh()
    } else {
      alert(`Error al seleccionar: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleSelect}
      disabled={pending}
      className="bg-zinc-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
    >
      {pending ? 'Seleccionando...' : 'Seleccionar'}
    </button>
  )
}
