'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type ServicePickerOption = {
  value: string
  label: string
  icon: string
}

type ServicePickerProps = {
  name: string
  options: ServicePickerOption[]
  placeholder: string
  searchLabel: string
  allServicesLabel: string
  noResultsLabel: string
  defaultValue?: string
}

export function ServicePicker({
  name,
  options,
  placeholder,
  searchLabel,
  allServicesLabel,
  noResultsLabel,
  defaultValue = '',
}: ServicePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedValue, setSelectedValue] = useState(defaultValue)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuId = useId()

  const selectedOption = options.find((option) => option.value === selectedValue)
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) =>
      option.label.toLocaleLowerCase().includes(normalizedQuery),
    )
  }, [options, query])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const timeout = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [isOpen])

  const selectService = (value: string) => {
    setSelectedValue(value)
    setIsOpen(false)
    setQuery('')
  }

  const toggleMenu = () => {
    if (isOpen) {
      setIsOpen(false)
      setQuery('')
      return
    }

    setIsOpen(true)
  }

  return (
    <div
      ref={rootRef}
      className="motion-panel relative z-30 flex-1 border-b border-outline-variant md:border-b-0 md:border-r"
    >
      <input name={name} type="hidden" value={selectedValue} />

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-haspopup="dialog"
        onClick={toggleMenu}
        className="motion-interactive flex w-full items-center gap-3 rounded-t-xl rounded-b-none px-4 py-3 text-left outline-none transition-colors duration-200 hover:bg-primary-container/50 focus-visible:bg-primary-container/70 md:rounded-l-full md:rounded-r-none"
      >
        <span
          className="material-symbols-outlined shrink-0 text-[22px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {selectedOption?.icon ?? 'search'}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">
          {selectedOption?.label ?? placeholder}
        </span>
        <span
          aria-hidden
          className={`material-symbols-outlined shrink-0 text-[20px] text-on-surface-variant transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="dialog"
          aria-label={placeholder}
          className="motion-reveal absolute left-0 top-[calc(100%+0.6rem)] w-full min-w-[19rem] max-h-[21rem] overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-[0_18px_48px_-22px_rgb(7_132_242_/_0.4)] md:min-w-[28rem] md:max-h-[24rem]"
        >
          <div className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2.5">
            <span className="material-symbols-outlined text-[20px] text-primary">search</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchLabel}
              className="motion-field min-w-0 flex-1 bg-transparent text-body-md text-on-surface outline-none placeholder:text-on-surface-variant/60"
            />
          </div>

          <div className="motion-list mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => selectService('')}
              className={`motion-list-item motion-interactive btn-press flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${
                !selectedValue
                  ? 'border-primary bg-primary-container text-primary'
                  : 'border-outline-variant text-on-surface hover:border-outline hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[21px]">apps</span>
              <span className="text-label-md">{allServicesLabel}</span>
            </button>

            {filteredOptions.map((option) => {
              const isSelected = option.value === selectedValue

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectService(option.value)}
                  className={`motion-list-item motion-interactive btn-press flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${
                    isSelected
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-outline-variant text-on-surface hover:border-outline hover:bg-surface-container'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[21px] ${
                      isSelected ? 'text-primary' : 'text-secondary'
                    }`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {option.icon}
                  </span>
                  <span className="min-w-0 text-label-md leading-snug">{option.label}</span>
                </button>
              )
            })}
          </div>

          {filteredOptions.length === 0 && (
            <p className="px-2 py-5 text-center text-body-md text-on-surface-variant">
              {noResultsLabel}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
