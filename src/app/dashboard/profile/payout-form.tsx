'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayoutSettings } from '@/actions/payouts'
import type { PayoutMethod } from '@/types/index'

const inputClass =
  'motion-field w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

type PayoutInitial = {
  payoutMethod: PayoutMethod | null
  paypalEmail: string
  tkieroAccount: string
}

export function PayoutForm({ initial }: { initial: PayoutInitial }) {
  const router = useRouter()
  const [method, setMethod] = useState<PayoutMethod>(initial.payoutMethod ?? 'PAYPAL')
  const [paypalEmail, setPaypalEmail] = useState(initial.paypalEmail)
  const [tkieroAccount, setTkieroAccount] = useState(initial.tkieroAccount)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const result = await updatePayoutSettings(
      method === 'PAYPAL'
        ? { payoutMethod: 'PAYPAL', paypalEmail }
        : { payoutMethod: 'TKIERO', tkieroAccount },
    )
    setPending(false)
    if (result.success) {
      setMessage('Método de cobro guardado')
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="motion-surface bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-headline-md text-on-surface">Método de cobro</h2>
        <p className="text-body-md text-on-surface-variant mt-1">
          Aquí te depositaremos el pago de tus trabajos completados.
        </p>
      </div>

      {!initial.payoutMethod && (
        <div className="flex items-center gap-2 bg-primary-container text-on-primary-container rounded-xl px-4 py-3 text-label-md">
          <span className="material-symbols-outlined text-[18px]">info</span>
          Sin método de cobro configurado no podremos liquidarte los trabajos completados.
        </div>
      )}

      <div className="flex bg-surface-container rounded-full p-1 gap-1">
        {(['PAYPAL', 'TKIERO'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`motion-interactive flex-1 py-2 rounded-full text-label-md transition-colors duration-200 ${
              method === m ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            {m === 'PAYPAL' ? 'PayPal' : 'Tkiero'}
          </button>
        ))}
      </div>

      {method === 'PAYPAL' ? (
        <div>
          <label htmlFor="paypal-email" className="text-label-md text-on-surface-variant block mb-1">
            Email de tu cuenta PayPal
          </label>
          <input
            id="paypal-email"
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="tu-correo@ejemplo.com"
            required
            className={inputClass}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="tkiero-account" className="text-label-md text-on-surface-variant block mb-1">
            Cuenta Tkiero
          </label>
          <input
            id="tkiero-account"
            value={tkieroAccount}
            onChange={(e) => setTkieroAccount(e.target.value)}
            placeholder="@tu-cuenta"
            required
            className={inputClass}
          />
        </div>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="motion-interactive btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
      >
        {pending ? 'Guardando...' : 'Guardar método de cobro'}
      </button>
    </form>
  )
}
