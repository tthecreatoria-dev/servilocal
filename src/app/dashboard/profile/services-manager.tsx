'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createService, updateService, toggleServiceActive } from '@/actions/services'
import { CATEGORY_LABELS, CATEGORY_KEYS } from '@/lib/categories'
import type { ServiceCategory } from '@/types/index'

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

export type ManagedService = {
  id: string
  title: string
  description: string
  price: number
  category: ServiceCategory
  isActive: boolean
}

type FormState = {
  title: string
  description: string
  price: string
  category: ServiceCategory
}

const EMPTY_FORM: FormState = { title: '', description: '', price: '', category: 'PLUMBING' }

export function ServicesManager({ services }: { services: ManagedService[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMessage(null)
  }

  function startEdit(service: ManagedService) {
    setEditingId(service.id)
    setForm({
      title: service.title,
      description: service.description,
      price: String(service.price),
      category: service.category,
    })
    setShowForm(true)
    setMessage(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const payload = {
      title: form.title,
      description: form.description,
      price: Number(form.price),
      category: form.category,
    }
    const result = editingId
      ? await updateService({ id: editingId, ...payload })
      : await createService(payload)
    setPending(false)
    if (result.success) {
      setMessage(editingId ? 'Servicio actualizado' : 'Servicio creado')
      closeForm()
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  async function handleToggle(service: ManagedService) {
    setPending(true)
    setMessage(null)
    const result = await toggleServiceActive({ id: service.id, isActive: !service.isActive })
    setPending(false)
    if (result.success) {
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-headline-md text-on-surface">Mis servicios</h2>
          <p className="text-body-md text-on-surface-variant mt-1">
            Los servicios activos se muestran en tu perfil público como catálogo.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="btn-press shrink-0 flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nuevo servicio
          </button>
        )}
      </div>

      {services.length === 0 && !showForm && (
        <p className="text-body-md text-on-surface-variant">
          Aún no has agregado servicios. Agrega los servicios que ofreces con su precio
          para que los clientes los vean en tu perfil.
        </p>
      )}

      {services.length > 0 && (
        <ul className="divide-y divide-outline-variant">
          {services.map((service) => (
            <li
              key={service.id}
              className={`py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4 ${
                service.isActive ? '' : 'opacity-50'
              }`}
            >
              <div className="min-w-0">
                <p className="text-label-md text-on-surface">
                  {service.title}
                  {!service.isActive && (
                    <span className="ml-2 text-label-sm text-on-surface-variant">(inactivo)</span>
                  )}
                </p>
                <p className="text-body-md text-on-surface-variant line-clamp-2 mt-0.5">
                  {service.description}
                </p>
                <p className="text-label-sm text-on-surface-variant mt-1">
                  {CATEGORY_LABELS[service.category]}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-label-md text-on-surface">${service.price.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => startEdit(service)}
                  disabled={pending}
                  aria-label={`Editar ${service.title}`}
                  className="btn-press p-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(service)}
                  disabled={pending}
                  aria-label={service.isActive ? `Desactivar ${service.title}` : `Activar ${service.title}`}
                  className="btn-press p-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {service.isActive ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="border-t border-outline-variant pt-5 flex flex-col gap-4">
          <h3 className="text-label-md text-on-surface">
            {editingId ? 'Editar servicio' : 'Nuevo servicio'}
          </h3>

          <div>
            <label htmlFor="service-title" className="text-label-md text-on-surface-variant block mb-1">
              Título
            </label>
            <input
              id="service-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Reparación de fugas"
              required
              minLength={5}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="service-description" className="text-label-md text-on-surface-variant block mb-1">
              Descripción
            </label>
            <textarea
              id="service-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe qué incluye el servicio, materiales, tiempos…"
              required
              minLength={20}
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="service-price" className="text-label-md text-on-surface-variant block mb-1">
                Precio (USD)
              </label>
              <input
                id="service-price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="25.00"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="service-category" className="text-label-md text-on-surface-variant block mb-1">
                Categoría
              </label>
              <select
                id="service-category"
                value={form.category}
                onChange={(e) =>
                  // Los <option> se generan solo desde CATEGORY_KEYS; el server action revalida con Zod.
                  setForm({ ...form, category: e.target.value as ServiceCategory })
                }
                className={inputClass}
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear servicio'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={pending}
              className="btn-press px-6 py-3 rounded-full text-label-md text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}
    </section>
  )
}
