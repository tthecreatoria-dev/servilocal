'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { registerAndLogin } from '@/actions/auth'
import type { AuthState } from '@/actions/auth'
import { SubmitButton } from '@/components/ui/submit-button'

type Skill = 'PLUMBING' | 'TEACHING' | 'DELIVERY' | 'CLEANING' | 'DESIGN' | 'DIGITAL'

const SKILLS: { value: Skill; label: string; icon: string }[] = [
  { value: 'PLUMBING',  label: 'Fontanería',      icon: 'plumbing' },
  { value: 'TEACHING',  label: 'Enseñanza',        icon: 'school' },
  { value: 'DELIVERY',  label: 'Delivery',         icon: 'local_shipping' },
  { value: 'CLEANING',  label: 'Limpieza',         icon: 'cleaning_services' },
  { value: 'DESIGN',    label: 'Diseño',           icon: 'palette' },
  { value: 'DIGITAL',   label: 'Digital / Tech',   icon: 'computer' },
]

const COUNTRY_CODES = [
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+1',   flag: '🇺🇸', name: 'EE. UU.' },
  { code: '+52',  flag: '🇲🇽', name: 'México' },
  { code: '+34',  flag: '🇪🇸', name: 'España' },
]

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('Auth')
  const [state, formAction] = useActionState<AuthState | null, FormData>(
    registerAndLogin,
    null,
  )
  const [role, setRole]               = useState<'CLIENT' | 'PROVIDER'>('CLIENT')
  const [skills, setSkills]           = useState<Skill[]>([])
  const [countryCode, setCountryCode] = useState('+503')
  const [phoneNumber, setPhoneNumber] = useState('')

  function toggleSkill(skill: Skill) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    )
  }

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-md p-6 sm:p-10">
      <div className="flex items-center gap-2 mb-8">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          handshake
        </span>
        <span className="text-headline-md text-primary">ServiLocal</span>
      </div>

      <h1 className="text-headline-md text-on-surface mb-2">{t('register.title')}</h1>
      <p className="text-body-md text-on-surface-variant mb-8">{t('register.subtitle')}</p>

      {state?.error && (
        <div className="flex items-center gap-2 bg-primary-container border border-outline text-on-primary-container rounded-xl px-4 py-3 text-label-md mb-4">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="role" value={role} />

        {/* Hidden skills inputs — one per selected skill */}
        {skills.map((s) => (
          <input key={s} type="hidden" name="skills" value={s} />
        ))}

        {/* Role toggle */}
        <div>
          <label className="text-label-md text-on-surface-variant block mb-2">
            {t('register.roleLabel')}
          </label>
          <div className="flex bg-surface-container rounded-full p-1 gap-1">
            <button
              type="button"
              onClick={() => setRole('CLIENT')}
              className={`flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
                role === 'CLIENT'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {t('register.roleClient')}
            </button>
            <button
              type="button"
              onClick={() => setRole('PROVIDER')}
              className={`flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
                role === 'PROVIDER'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {t('register.roleProvider')}
            </button>
          </div>
        </div>

        {/* Full name */}
        <div>
          <label htmlFor="name" className="text-label-md text-on-surface-variant block mb-1">
            {t('fields.fullName')}
          </label>
          <input id="name" name="name" type="text" autoComplete="name" required className={inputClass} />
          {state?.fieldErrors?.name && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.name}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="text-label-md text-on-surface-variant block mb-1">
            {t('fields.email')}
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          {state?.fieldErrors?.email && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.email}</p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phoneNumber" className="text-label-md text-on-surface-variant block mb-1">
            Teléfono
          </label>
          <input type="hidden" name="phone" value={`${countryCode}${phoneNumber}`} />
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="border border-outline rounded-xl px-3 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary bg-surface-container-lowest transition-colors shrink-0"
            >
              {COUNTRY_CODES.map(({ code, flag, name }) => (
                <option key={code} value={code}>
                  {flag} {code} {name}
                </option>
              ))}
            </select>
            <input
              id="phoneNumber"
              type="tel"
              inputMode="numeric"
              placeholder="7900 0000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\s/g, ''))}
              required
              className={`${inputClass} flex-1`}
            />
          </div>
          {state?.fieldErrors?.phone && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.phone}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="text-label-md text-on-surface-variant block mb-1">
            {t('fields.password')}
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" required className={inputClass} />
          {state?.fieldErrors?.password && (
            <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.password}</p>
          )}
        </div>

        {/* Skills — only for PROVIDER */}
        {role === 'PROVIDER' && (
          <div>
            <label className="text-label-md text-on-surface-variant block mb-1">
              Mis habilidades
              <span className="text-label-sm text-on-surface-variant/60 ml-1">(selecciona todas las que apliquen)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {SKILLS.map(({ value, label, icon }) => {
                const active = skills.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleSkill(value)}
                    className={`btn-press flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      active
                        ? 'bg-primary border-primary text-on-primary'
                        : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary/60 hover:bg-surface-container'
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-[20px] shrink-0"
                      style={{ fontVariationSettings: `'FILL' ${active ? 1 : 0}` }}
                    >
                      {icon}
                    </span>
                    <span className="text-label-sm">{label}</span>
                  </button>
                )
              })}
            </div>
            {state?.fieldErrors?.skills && (
              <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.skills}</p>
            )}
            {skills.length === 0 && (
              <p className="text-on-surface-variant/60 text-label-sm mt-1">
                Selecciona al menos una habilidad para continuar.
              </p>
            )}
          </div>
        )}

        <SubmitButton label={t('register.button')} />
      </form>

      <p className="text-center text-body-md text-on-surface-variant mt-8">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          {t('register.loginLink')}
        </Link>
      </p>
    </div>
  )
}
