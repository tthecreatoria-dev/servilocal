'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/actions/profile'
import { LocationPicker, type LocationValue } from '@/components/features/location-picker'
import { CATEGORY_LABELS } from '@/lib/categories'
import type { ServiceCategory, UserRole } from '@/types/index'

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

type ProfileInitial = {
  name: string
  phone: string
  bio: string
  skills: ServiceCategory[]
  isRemote: boolean
  address: string
  latitude: number | null
  longitude: number | null
  showPhone: boolean
}

export function ProfileForm({ role, initial }: { role: UserRole; initial: ProfileInitial }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [bio, setBio] = useState(initial.bio)
  const [skills, setSkills] = useState<ServiceCategory[]>(initial.skills)
  const [location, setLocation] = useState<LocationValue>({
    isRemote: initial.isRemote,
    address: initial.address,
    latitude: initial.latitude,
    longitude: initial.longitude,
  })
  const [showPhone, setShowPhone] = useState(initial.showPhone)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function toggleSkill(skill: ServiceCategory) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const result = await updateProfile({
      name,
      phone,
      ...(role === 'PROVIDER'
        ? {
            bio,
            skills,
            showPhone,
            isRemote: location.isRemote,
            address: location.isRemote ? undefined : location.address || undefined,
            latitude: location.isRemote ? undefined : location.latitude ?? undefined,
            longitude: location.isRemote ? undefined : location.longitude ?? undefined,
          }
        : {}),
    })
    setPending(false)
    if (result.success) {
      setMessage('Perfil actualizado')
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <h2 className="text-headline-md text-on-surface">Información personal</h2>

      <div>
        <label htmlFor="profile-name" className="text-label-md text-on-surface-variant block mb-1">Nombre completo</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      </div>

      <div>
        <label htmlFor="profile-phone" className="text-label-md text-on-surface-variant block mb-1">Teléfono</label>
        <input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputClass} />
      </div>

      {role === 'PROVIDER' && (
        <>
          <div>
            <label htmlFor="profile-bio" className="text-label-md text-on-surface-variant block mb-1">Bio</label>
            <textarea id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} className={inputClass} />
          </div>

          <div>
            <span className="text-label-md text-on-surface-variant block mb-2">Mis habilidades</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((value) => {
                const active = skills.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleSkill(value)}
                    className={`btn-press px-3 py-2.5 rounded-xl border text-left text-label-sm transition-colors ${
                      active
                        ? 'bg-primary border-primary text-on-primary'
                        : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary/60'
                    }`}
                  >
                    {CATEGORY_LABELS[value]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className="text-label-md text-on-surface-variant block mb-2">Mi ubicación</span>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showPhone}
              onChange={(e) => setShowPhone(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="text-label-md text-on-surface block">
                Mostrar mi teléfono en mi perfil público
              </span>
              <span className="text-body-md text-on-surface-variant">
                Los clientes podrán contactarte directamente. El contacto directo ocurre fuera
                de ServiLocal, sin garantía ni protección de pago.
              </span>
            </span>
          </label>
        </>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
      >
        {pending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}
