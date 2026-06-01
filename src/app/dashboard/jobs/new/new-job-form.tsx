'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJobPost } from '@/actions/jobs'

type Category = 'PLUMBING' | 'TEACHING' | 'DELIVERY' | 'CLEANING' | 'DESIGN' | 'DIGITAL'

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'PLUMBING',  label: 'Fontanería', icon: 'plumbing' },
  { value: 'TEACHING',  label: 'Enseñanza',  icon: 'school' },
  { value: 'DELIVERY',  label: 'Delivery',   icon: 'local_shipping' },
  { value: 'CLEANING',  label: 'Limpieza',   icon: 'cleaning_services' },
  { value: 'DESIGN',    label: 'Diseño',     icon: 'palette' },
  { value: 'DIGITAL',   label: 'Digital',    icon: 'computer' },
]

const ERROR_LABELS: Record<string, string> = {
  unauthorized: 'Debes iniciar sesión para publicar.',
  forbidden:    'Solo los clientes pueden publicar proyectos.',
  validation:   'Revisa los datos del formulario.',
}

export function NewJobForm() {
  const router = useRouter()
  const [error, setError]       = useState<string | null>(null)
  const [pending, setPending]   = useState(false)
  const [category, setCategory] = useState<Category | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!category) {
      setError('Selecciona una categoría antes de continuar.')
      return
    }
    setPending(true)
    setError(null)

    const fd          = new FormData(e.currentTarget)
    const deadlineRaw = fd.get('deadline') as string
    const result      = await createJobPost({
      title:       fd.get('title') as string,
      description: fd.get('description') as string,
      category,
      budget:   Number(fd.get('budget')),
      deadline: new Date(deadlineRaw).toISOString(),
    })

    if (!result.success) {
      setError(ERROR_LABELS[result.error] ?? result.error)
      setPending(false)
      return
    }

    router.push(`/dashboard/jobs/${result.data.id}/pay`)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-7">

      {/* Error banner */}
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

      {/* Título */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-label-md text-on-surface">
          Título del proyecto
        </label>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
            edit_note
          </span>
          <input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={150}
            placeholder="Ej: Necesito fontanero para reparar tuberías"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <label htmlFor="description" className="block text-label-md text-on-surface">
          Descripción
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={20}
          maxLength={2000}
          rows={4}
          placeholder="Describe en detalle lo que necesitas: horarios, materiales, experiencia requerida…"
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
        />
      </div>

      {/* Categoría */}
      <div className="space-y-3">
        <label className="block text-label-md text-on-surface">Categoría</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CATEGORIES.map(({ value, label, icon }) => {
            const active = category === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`btn-press flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-primary border-primary text-on-primary'
                    : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary/60 hover:bg-surface-container'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px] shrink-0"
                  style={{ fontVariationSettings: `'FILL' ${active ? 1 : 0}` }}
                >
                  {icon}
                </span>
                <span className="text-label-md">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Presupuesto + Fecha */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="budget" className="block text-label-md text-on-surface">
            Presupuesto
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-body-md font-semibold pointer-events-none select-none">
              $
            </span>
            <input
              id="budget"
              name="budget"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-8 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="deadline" className="block text-label-md text-on-surface">
            Fecha límite
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
              calendar_month
            </span>
            <input
              id="deadline"
              name="deadline"
              type="date"
              required
              min={today}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-4 py-3.5 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors [color-scheme:light]"
            />
          </div>
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
            Publicando…
          </>
        ) : (
          <>
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              publish
            </span>
            Publicar proyecto
          </>
        )}
      </button>
    </form>
  )
}
