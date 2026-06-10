# Register address → map pin (forward geocoding) — Design

Date: 2026-06-09
Status: Approved by user

## Problem

In `/register`, the provider location section has an address input and a Leaflet map.
The pin → address direction works (reverse geocoding on pick/drag), but typing an
address does nothing to the pin. The user wants the pin to follow the typed address.

## Decision

Autocomplete dropdown (user-selected over auto-jump and Enter-to-search): while the
user types, show up to 5 Nominatim suggestions; selecting one sets the address text
and moves the pin to its coordinates.

## Design

### 1. Suggestion search — client-side helper

New client-safe module `src/lib/address-suggestions.ts`:

- `searchAddressSuggestions(query, signal)` — fetches
  `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=sv`
  with `Accept-Language: es`, returns `AddressSuggestion[]`.
- `parseNominatimSuggestions(data)` — pure function turning the raw response into
  `{ label, lat, lng }[]`, skipping malformed entries. Unit-tested.

Client calls Nominatim directly, consistent with the existing `reverseGeocode`
in `location-picker.tsx`. No server action proxy (no secret to protect).

### 2. Dropdown in `LocationPicker`

- Debounce 700 ms, minimum 3 characters before querying (Nominatim usage policy).
- Absolute-positioned listbox under the input, up to 5 suggestions; "Sin resultados"
  row when the query returns nothing.
- Selecting: updates `address` + `latitude`/`longitude` via `onChange`, closes the
  dropdown, and suppresses the next search (flag) so selection doesn't re-query.
- Escape closes. Enter while the dropdown is open selects the highlighted/first
  suggestion and `preventDefault()`s so the register form doesn't submit.
- Stale responses discarded via `AbortController` (abort previous request on each
  new query).

### 3. Map recentering in `LocationMap`

react-leaflet's `MapContainer.center` only applies on mount. Add an internal
`Recenter` component using `useMap()` that calls `map.flyTo([lat, lng])` when the
coordinates change, so the view follows the pin when a suggestion is picked.

### 4. Out of scope / unchanged

- Register server action, Zod schema, hidden inputs — already wired for
  `latitude`/`longitude`.
- No new dependencies.

### 5. Testing

- Unit tests for `parseNominatimSuggestions` following
  `src/lib/__tests__/geocode.test.ts` patterns.
- Manual browser verification of the full flow.
