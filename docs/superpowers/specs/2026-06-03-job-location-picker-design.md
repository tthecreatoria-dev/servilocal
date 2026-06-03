# Job Location Picker — Design

**Date:** 2026-06-03
**Status:** Approved, pending implementation plan
**Area:** `src/app/dashboard/jobs/new/new-job-form.tsx` and supporting layers

## Goal

Let a client set the physical location of a job when publishing it: a text address
plus an easy-to-use interactive map where they drop/drag a pin. Many jobs in the
DIGITAL/DESIGN categories are remote, so location must be skippable via a "remote"
toggle.

## Decisions (from brainstorming)

- **Map approach:** Address text + interactive Leaflet/OpenStreetMap pin (free, no API key).
- **Required?:** Optional via a "Trabajo remoto / en línea" toggle. If not remote,
  address + coordinates are required. If remote, location is hidden and skipped.
- **Auto-fill:** Yes — dragging/placing the pin reverse-geocodes via OpenStreetMap
  Nominatim to populate the address field; the user can still edit it manually.

## Stack constraints

- React 19.2, Next 16 → use **react-leaflet v5** (the version supporting React 19).
- Leaflet needs `window`, so the map is loaded via `next/dynamic` with `ssr: false`.

## 1. Data model — `prisma/schema.prisma`

Add to `model JobPost`:

```prisma
isRemote   Boolean   @default(false)
address    String?
latitude   Float?
longitude  Float?
```

- Coordinates are `Float`, not `Decimal` — they don't need exact-decimal precision
  and `Float` avoids `Decimal.js` objects leaking to the client. (Money stays `Decimal`.)
- All fields are nullable/defaulted, so a migration applies cleanly to existing rows
  (`isRemote = false`, null location is a valid combination for legacy data).
- A Prisma migration is required.

## 2. Validation — `src/types/schemas.ts`

Extend `CreateJobPostSchema`:

```ts
isRemote: z.boolean(),
address:   z.string().min(5).max(200).optional(),
latitude:  z.number().min(-90).max(90).optional(),
longitude: z.number().min(-180).max(180).optional(),
```

Add a `.superRefine`:

- If `isRemote === false`: `address`, `latitude`, and `longitude` are **all required**
  (attach issues to the missing fields).
- If `isRemote === true`: location fields are ignored (not required).

This is the server-side invariant backing the UI toggle. `CreateJobPostInput` updates
automatically via `z.infer`.

## 3. Server action — `src/actions/jobs.ts`

In `createJobPost`, pass the new parsed fields into `db.jobPost.create`:

```ts
isRemote:  parsed.data.isRemote,
address:   parsed.data.isRemote ? null : parsed.data.address,
latitude:  parsed.data.isRemote ? null : parsed.data.latitude,
longitude: parsed.data.isRemote ? null : parsed.data.longitude,
```

- Single-table write → no `prisma.$transaction` needed.
- No payment logic touched. Auth/role checks unchanged.

## 4. New component — `src/components/features/location-picker.tsx`

A named-export client component (`'use client'`). Owns location state and surfaces it
to the form.

- **Props:** `value: { isRemote, address, latitude, longitude }` and an
  `onChange(next)` callback (controlled), so the form holds the source of truth.
- **Map:** react-leaflet v5 + leaflet, loaded via `next/dynamic({ ssr: false })`.
  Leaflet CSS imported once (in the component or a top-level location).
- **Default center:** San Salvador `13.6929, -89.2182`, sensible zoom (~13).
- **Marker:** single draggable marker; clicking the map also moves it. Marker position
  drives `latitude`/`longitude`.
- **Reverse geocode:** on pin move, debounced ~600ms, fetch
  `https://nominatim.openstreetmap.org/reverse?format=json&lat=..&lon=..` and fill the
  address input. User edits remain authoritative (don't clobber while focused/typing).
- **Styling:** existing tokens — `bg-surface-container-lowest`, `border-outline-variant`,
  `rounded-xl`, `material-symbols-outlined`, focus ring `primary` — to match current fields.
- **Default leaflet marker icon** asset paths must be configured (known leaflet+bundler
  issue); set icon URLs explicitly so the pin renders.

## 5. Form wiring — `new-job-form.tsx`

- Add `isRemote` toggle ("Trabajo remoto / en línea") and location state (lifted, passed
  to `<LocationPicker>`).
- Placement: **after Category, before Budget/Deadline.** When `isRemote` is on, the
  picker collapses and location is skipped.
- On submit: include `isRemote`, and when not remote `address`/`latitude`/`longitude`.
  Add a client-side guard mirroring the Zod rule ("Marca la ubicación en el mapa o activa
  trabajo remoto.") so users get a friendly message instead of a generic `validation` error.
- Add a matching key to `ERROR_LABELS` if the server returns a location-specific error.

## New dependencies

- `leaflet` (runtime)
- `react-leaflet@^5` (runtime, React 19 compatible)
- `@types/leaflet` (dev)

All free, no API key. Nominatim is a free OSM service.

## Production notes / caveats

- Nominatim usage policy: low volume only; production should send a descriptive
  `User-Agent`/`Referer` and consider client-side rate limiting or a self-hosted/geocoding
  provider if volume grows. Reverse-geocode failures must degrade gracefully (keep the
  pin; let the user type the address).
- Reverse geocoding is best-effort UX; the authoritative location is the pin coordinates
  plus whatever address text the user submits.

## Out of scope

- Displaying the location on job-detail or search/listing pages.
- Geocoding result caching.
- Forward geocoding / address search box (only reverse-from-pin).
- KYC / verification.
