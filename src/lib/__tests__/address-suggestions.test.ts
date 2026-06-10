import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseNominatimSuggestions,
  searchAddressSuggestions,
} from '@/lib/address-suggestions'

describe('parseNominatimSuggestions()', () => {
  it('maps raw results to labeled coordinates', () => {
    const raw = [
      { display_name: 'Colonia Escalón, San Salvador', lat: '13.7034', lon: '-89.2407' },
      { display_name: 'Santa Tecla, La Libertad', lat: '13.6731', lon: '-89.2890' },
    ]
    expect(parseNominatimSuggestions(raw)).toEqual([
      { label: 'Colonia Escalón, San Salvador', lat: 13.7034, lng: -89.2407 },
      { label: 'Santa Tecla, La Libertad', lat: 13.6731, lng: -89.289 },
    ])
  })

  it('skips entries with missing or non-numeric coordinates', () => {
    const raw = [
      { display_name: 'Sin lat', lon: '-89.2' },
      { display_name: 'Lat inválida', lat: 'abc', lon: '-89.2' },
      { display_name: 'Válida', lat: '13.7', lon: '-89.2' },
    ]
    expect(parseNominatimSuggestions(raw)).toEqual([
      { label: 'Válida', lat: 13.7, lng: -89.2 },
    ])
  })

  it('skips entries without a display name', () => {
    expect(parseNominatimSuggestions([{ lat: '13.7', lon: '-89.2' }])).toEqual([])
  })

  it('returns an empty array for an empty response', () => {
    expect(parseNominatimSuggestions([])).toEqual([])
  })

  it('deduplicates suggestions with identical labels', () => {
    const raw = [
      { display_name: 'Santa Ana, El Salvador', lat: '13.9947', lon: '-89.5566' },
      { display_name: 'Santa Ana, El Salvador', lat: '13.9950', lon: '-89.5570' },
    ]
    expect(parseNominatimSuggestions(raw)).toEqual([
      { label: 'Santa Ana, El Salvador', lat: 13.9947, lng: -89.5566 },
    ])
  })
})

describe('searchAddressSuggestions()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed suggestions on success', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        { display_name: 'San Salvador', lat: '13.6929', lon: '-89.2182' },
      ],
    })
    const result = await searchAddressSuggestions('San Salvador')
    expect(result).toEqual([{ label: 'San Salvador', lat: 13.6929, lng: -89.2182 }])
  })

  it('returns an empty array on a non-ok response', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    expect(await searchAddressSuggestions('San Salvador')).toEqual([])
  })

  it('returns an empty array when fetch throws', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))
    expect(await searchAddressSuggestions('San Salvador')).toEqual([])
  })

  it('returns an empty array for a blank query without calling fetch', async () => {
    expect(await searchAddressSuggestions('   ')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
