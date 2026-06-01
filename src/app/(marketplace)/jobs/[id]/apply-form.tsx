'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJobApplication } from '@/actions/jobs'

const ERROR_LABELS: Record<string, string> = {
  unauthorized:        'Debes iniciar sesión.',
  forbidden:           'Solo los proveedores pueden aplicar.',
  validation:          'Revisa los datos del formulario.',
  post_not_found:      'El proyecto ya no existe.',
  post_not_open:       'El proyecto ya no acepta propuestas.',
  already_applied:     'Ya enviaste una propuesta para este proyecto.',
}

export function ApplyForm({ jobPostId, budget }: { jobPostId: string; budget: number }) {
  const router  = useRouter()
  const [error, setError]     = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd     = new FormData(e.currentTarget)
    const result = await createJobApplication({
      jobPostId,
      message:       (fd.get('message') ?? '') as string,
      proposedPrice: Number(fd.get('proposedPrice') ?? 0),
    })

    if (!result.success) {
      setError(ERROR_LABELS[result.error] ?? result.error)
      setPending(false)
      return
    }

    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 bg-primary-container border border-outline rounded-xl px-4 py-3">
          <span
            className="material-symbols-outlined text-on-primary-container text-[20px] mt-0.5 shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            error
          </span>
          <p className="text-on-primary-container text-label-md">{error}</p>
        </div>
      )}

      {/* Mensaje */}
      <div className="space-y-2">
        <label htmlFor="message" className="block text-label-md text-on-surface">
          Mensaje al cliente
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          placeholder="Explica por qué eres la mejor opción, tu experiencia y disponibilidad…"
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
        />
      </div>

      {/* Precio propuesto */}
      <div className="space-y-2">
        <label htmlFor="proposedPrice" className="block text-label-md text-on-surface">
          Precio propuesto
        </label>
        <p className="text-label-sm text-on-surface-variant">
          El cliente tiene un presupuesto de{' '}
          <strong className="text-on-surface">${budget.toFixed(2)}</strong>
        </p>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-body-md font-semibold pointer-events-none select-none">
            $
          </span>
          <input
            id="proposedPrice"
            name="proposedPrice"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-8 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="btn-press w-full bg-primary text-on-primary py-4 rounded-full text-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {pending ? (
          <>
            <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
            Enviando…
          </>
        ) : (
          <>
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              send
            </span>
            Enviar propuesta
          </>
        )}
      </button>
    </form>
  )
}
