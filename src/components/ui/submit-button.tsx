'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-press w-full bg-primary text-on-primary py-3 rounded-full text-label-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? 'Loading…' : label}
    </button>
  )
}
