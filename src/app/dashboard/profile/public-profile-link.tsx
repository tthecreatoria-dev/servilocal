'use client'

import { useState } from 'react'

export function PublicProfileLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="motion-surface bg-surface-container-lowest border border-outline-variant rounded-2xl p-6">
      <h2 className="text-headline-md text-on-surface mb-1">Tu perfil público</h2>
      <p className="text-body-md text-on-surface-variant mb-4">
        Comparte este enlace como tu tarjeta de presentación digital.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="motion-interactive flex-1 truncate text-label-md text-primary hover:underline bg-surface-container rounded-xl px-4 py-3"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="motion-interactive btn-press inline-flex items-center justify-center gap-2 border border-outline-variant px-5 py-3 rounded-full text-label-md text-on-surface hover:bg-surface-container transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
    </div>
  )
}
