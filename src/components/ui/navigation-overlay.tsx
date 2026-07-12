'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { PageLoader } from './page-loader'

const MIN_VISIBLE_MS = 400
const SAFETY_TIMEOUT_MS = 6000

export function NavigationOverlay() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const elapsed = Date.now() - shownAtRef.current
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
    clearTimeout(hideTimerRef.current)
    clearTimeout(safetyTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), remaining)
    // Navigation is considered "done" as soon as the URL the router resolved to changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  useEffect(() => {
    function show() {
      clearTimeout(hideTimerRef.current)
      clearTimeout(safetyTimerRef.current)
      shownAtRef.current = Date.now()
      setVisible(true)
      safetyTimerRef.current = setTimeout(() => setVisible(false), SAFETY_TIMEOUT_MS)
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement)?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      let target: URL
      try {
        target = new URL(href, window.location.href)
      } catch {
        return
      }
      if (target.origin !== window.location.origin) return
      if (target.pathname + target.search === window.location.pathname + window.location.search) return

      show()
    }

    window.addEventListener('click', handleClick)
    window.addEventListener('popstate', show)
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('popstate', show)
    }
  }, [])

  return (
    <div
      aria-hidden={!visible}
      className={`nav-overlay fixed inset-0 z-100 flex items-center justify-center bg-background ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <PageLoader />
    </div>
  )
}
