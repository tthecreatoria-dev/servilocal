# Job Location Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client attach an address + interactive map pin (or mark the job as remote) when publishing a job.

**Architecture:** Add nullable location fields + an `isRemote` flag to `JobPost`. Enforce "location required unless remote" in the Zod schema via `superRefine`, pass it through the `createJobPost` server action, and build a controlled `LocationPicker` client component (react-leaflet + OpenStreetMap, reverse-geocoded address via Nominatim) wired into `NewJobForm`.

**Tech Stack:** Next 16, React 19, TypeScript strict, Prisma, Zod 4, Vitest (node env), Tailwind, react-leaflet v5 + leaflet.

**Spec:** `docs/superpowers/specs/2026-06-03-job-location-picker-design.md`

**Testing note:** The Vitest environment is `node` and there is no `@testing-library/react`/jsdom in the project. So the Zod schema (Task 3) and the server action (Task 4) are covered by TDD; the React component (Task 5) and form wiring (Task 6) are verified manually via `npm run dev`, matching the existing test culture.

---

### Task 1: Add map dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install runtime + dev dependencies**

Run:
```bash
npm install leaflet react-leaflet@^5
npm install -D @types/leaflet
```
Expected: install succeeds; `package.json` lists `leaflet`, `react-leaflet` (^5.x), and `@types/leaflet`. react-leaflet v5 supports React 19.

- [ ] **Step 2: Verify install and typecheck baseline**

Run: `npx tsc --noEmit`
Expected: no new errors (same as before the install).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add leaflet and react-leaflet for job location picker"
```

---

### Task 2: Add location fields to the JobPost model

**Files:**
- Modify: `prisma/schema.prisma` (model `JobPost`, around lines 73-92)

- [ ] **Step 1: Add fields to `model JobPost`**

Insert these four lines after the `status` / `paymentMethod` lines and before `clientId` (any position inside the model is fine):

```prisma
  isRemote       Boolean          @default(false)
  address        String?
  latitude       Float?
  longitude      Float?
```

- [ ] **Step 2: Create and apply the migration**

Run:
```bash
npx prisma migrate dev --name job_location_fields
```
Expected: a new migration is generated under `prisma/migrations/`, applied to the dev DB, and Prisma Client regenerates. `JobPost` now has `isRemote`, `address`, `latitude`, `longitude`.

- [ ] **Step 3: Verify Prisma Client types**

Run: `npx tsc --noEmit`
Expected: no errors. (The new fields are now part of `db.jobPost.create` input types.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add location fields to JobPost"
```

---

### Task 3: Extend CreateJobPostSchema with location validation

**Files:**
- Modify: `src/types/schemas.ts:43-52` (`CreateJobPostSchema`)
- Test: `src/types/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to `src/types/__tests__/schemas.test.ts` (and add `CreateJobPostSchema` to the import from `@/types/schemas` at the top of the file):

```ts
describe('CreateJobPostSchema location rules', () => {
  const base = {
    title: 'Fix my pipes',
    description: 'I need someone to fix leaking pipes in my bathroom',
    category: 'PLUMBING' as const,
    budget: 50,
    deadline: '2026-12-31T00:00:00.000Z',
  }

  it('accepts a remote job with no location', () => {
    const result = CreateJobPostSchema.safeParse({ ...base, isRemote: true })
    expect(result.success).toBe(true)
  })

  it('accepts a non-remote job with full location', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.7,
      longitude: -89.22,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-remote job missing coordinates', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
    })
    expect(result.success).toBe(false)
  })

  it('rejects coordinates out of range', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Somewhere',
      latitude: 200,
      longitude: -89.22,
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: FAIL — `CreateJobPostSchema` currently has no `isRemote`/location handling (e.g. the remote-job case fails because `isRemote` is unknown / required-field errors).

- [ ] **Step 3: Update the schema**

Replace the current `CreateJobPostSchema` definition (`src/types/schemas.ts:43-52`) with:

```ts
export const CreateJobPostSchema = z
  .object({
    title: z.string().min(5, 'Title must be at least 5 characters').max(150, 'Title must be at most 150 characters'),
    description: z.string().min(20, 'Description must be at least 20 characters').max(2000, 'Description must be at most 2000 characters'),
    category: z.enum(['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL']),
    budget: z.number().positive('Budget must be positive'),
    deadline: z.string().datetime('Deadline must be a valid ISO datetime').refine(
      (d) => new Date(d) > new Date(),
      'Deadline must be in the future',
    ),
    isRemote: z.boolean(),
    address: z.string().min(5, 'Address must be at least 5 characters').max(200, 'Address must be at most 200 characters').optional(),
    latitude: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude').optional(),
    longitude: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude').optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isRemote) {
      if (data.address === undefined) {
        ctx.addIssue({ code: 'custom', path: ['address'], message: 'Address is required for non-remote jobs' })
      }
      if (data.latitude === undefined) {
        ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude is required for non-remote jobs' })
      }
      if (data.longitude === undefined) {
        ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude is required for non-remote jobs' })
      }
    }
  })
```

Note (Zod 4): `ctx.addIssue({ code: 'custom', ... })` uses the string literal `'custom'`. `CreateJobPostInput` updates automatically via `z.infer` at line 70.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: PASS (all four new cases plus existing schema tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/types/__tests__/schemas.test.ts
git commit -m "feat(schema): require job location unless remote"
```

---

### Task 4: Pass location through the createJobPost action

**Files:**
- Modify: `src/actions/jobs.ts:27-36` (the `db.jobPost.create` call)
- Test: `src/actions/__tests__/jobs.test.ts`

- [ ] **Step 1: Update existing test data and assertions, add new cases**

In `src/actions/__tests__/jobs.test.ts`:

(a) Update `validJobPostData` (currently around lines 40-46) to include `isRemote` so it stays valid under the new schema:

```ts
const validJobPostData = {
  title: 'Fix my pipes',
  description: 'I need someone to fix leaking pipes in my bathroom',
  category: 'PLUMBING' as const,
  budget: 50,
  deadline: '2026-12-31T00:00:00.000Z',
  isRemote: false,
  address: 'Col. Escalón, San Salvador',
  latitude: 13.7,
  longitude: -89.22,
}
```

(b) Update the success-case assertion (currently lines 95-104) so the expected `create` payload includes the new fields:

```ts
    expect(mockJobPostCreate).toHaveBeenCalledWith({
      data: {
        title: 'Fix my pipes',
        description: 'I need someone to fix leaking pipes in my bathroom',
        category: 'PLUMBING',
        budget: 50,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
        clientId: 'client-1',
        isRemote: false,
        address: 'Col. Escalón, San Salvador',
        latitude: 13.7,
        longitude: -89.22,
      },
    })
```

(c) Add a new test inside `describe('createJobPost()', ...)` covering the remote path (location nulled out):

```ts
  it('nulls location fields for a remote job', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const created = { id: 'job-2', status: 'PENDING_PAYMENT', clientId: 'client-1' }
    mockJobPostCreate.mockResolvedValueOnce(created)

    const result = await createJobPost({
      title: 'Design a logo',
      description: 'I need a clean logo for my new bakery brand',
      category: 'DESIGN',
      budget: 80,
      deadline: '2026-12-31T00:00:00.000Z',
      isRemote: true,
    })

    expect(result).toEqual({ success: true, data: created })
    expect(mockJobPostCreate).toHaveBeenCalledWith({
      data: {
        title: 'Design a logo',
        description: 'I need a clean logo for my new bakery brand',
        category: 'DESIGN',
        budget: 80,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
        clientId: 'client-1',
        isRemote: true,
        address: null,
        latitude: null,
        longitude: null,
      },
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — the action does not yet pass `isRemote`/`address`/`latitude`/`longitude` to `create`.

- [ ] **Step 3: Update the action's create call**

Replace the `db.jobPost.create({ data: { ... } })` block in `src/actions/jobs.ts` (lines 27-36) with:

```ts
  const jobPost = await db.jobPost.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      budget: parsed.data.budget,
      deadline: new Date(parsed.data.deadline),
      clientId: session.user.id,
      isRemote: parsed.data.isRemote,
      address: parsed.data.isRemote ? null : parsed.data.address,
      latitude: parsed.data.isRemote ? null : parsed.data.latitude,
      longitude: parsed.data.isRemote ? null : parsed.data.longitude,
    },
  })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): persist job location on create"
```

---

### Task 5: Build the LocationPicker component

**Files:**
- Create: `src/components/features/location-map.tsx` (the leaflet map, loaded client-only)
- Create: `src/components/features/location-picker.tsx` (controlled wrapper: remote toggle + address + map)

- [ ] **Step 1: Create the leaflet map module**

Create `src/components/features/location-map.tsx`:

```tsx
'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet's default icon URLs break under bundlers; point them at the CDN explicitly.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

type LocationMapProps = {
  lat: number
  lng: number
  onPick: (lat: number, lng: number) => void
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function LocationMap({ lat, lng, onPick }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '260px', width: '100%' }}
      className="rounded-xl overflow-hidden border border-outline-variant"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <Marker
        position={[lat, lng]}
        draggable
        icon={markerIcon}
        eventHandlers={{
          dragend(e) {
            const pos = e.target.getLatLng()
            onPick(pos.lat, pos.lng)
          },
        }}
      />
    </MapContainer>
  )
}
```

- [ ] **Step 2: Create the controlled picker wrapper**

Create `src/components/features/location-picker.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const LocationMap = dynamic(
  () => import('./location-map').then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full rounded-xl border border-outline-variant bg-surface-container animate-pulse" />
    ),
  },
)

// San Salvador — sensible default center for a Salvadoran marketplace.
const DEFAULT_LAT = 13.6929
const DEFAULT_LNG = -89.2182

export type LocationValue = {
  isRemote: boolean
  address: string
  latitude: number | null
  longitude: number | null
}

type LocationPickerProps = {
  value: LocationValue
  onChange: (next: LocationValue) => void
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'es' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name ?? null
  } catch {
    return null
  }
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressEdited = useRef(false)

  useEffect(() => {
    return () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    }
  }, [])

  function handlePick(lat: number, lng: number) {
    onChange({ ...value, latitude: lat, longitude: lng })
    if (addressEdited.current) return
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      const found = await reverseGeocode(lat, lng)
      if (found && !addressEdited.current) {
        onChange({ ...value, latitude: lat, longitude: lng, address: found })
      }
    }, 600)
  }

  const lat = value.latitude ?? DEFAULT_LAT
  const lng = value.longitude ?? DEFAULT_LNG

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.isRemote}
          onChange={(e) => onChange({ ...value, isRemote: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-label-md text-on-surface">Trabajo remoto / en línea</span>
      </label>

      {!value.isRemote && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="address" className="block text-label-md text-on-surface">
              Dirección
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                location_on
              </span>
              <input
                id="address"
                name="address"
                value={value.address}
                onChange={(e) => {
                  addressEdited.current = true
                  onChange({ ...value, address: e.target.value })
                }}
                placeholder="Ej: Col. Escalón, San Salvador"
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          </div>

          <LocationMap lat={lat} lng={lng} onPick={handlePick} />
          <p className="text-label-sm text-on-surface-variant">
            Toca el mapa o arrastra el pin para marcar la ubicación.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/location-map.tsx src/components/features/location-picker.tsx
git commit -m "feat(ui): add LocationPicker with leaflet map and reverse geocoding"
```

---

### Task 6: Wire LocationPicker into NewJobForm

**Files:**
- Modify: `src/app/dashboard/jobs/new/new-job-form.tsx`

- [ ] **Step 1: Import the picker and add location state**

At the top of `new-job-form.tsx`, add to the imports:

```tsx
import { LocationPicker, type LocationValue } from '@/components/features/location-picker'
```

Inside `NewJobForm`, after the `category` state declaration (line 28), add:

```tsx
  const [location, setLocation] = useState<LocationValue>({
    isRemote: false,
    address: '',
    latitude: null,
    longitude: null,
  })
```

- [ ] **Step 2: Add a friendly error label**

Add a key to `ERROR_LABELS` (lines 18-22):

```tsx
  location:     'Marca la ubicación en el mapa o activa trabajo remoto.',
```

- [ ] **Step 3: Guard and send location in handleSubmit**

In `handleSubmit`, after the `if (!category)` guard (line 35), add a location guard:

```tsx
    if (!location.isRemote && (location.latitude === null || location.longitude === null || location.address.trim().length < 5)) {
      setError(ERROR_LABELS.location)
      return
    }
```

Then update the `createJobPost({ ... })` call (lines 41-47) to include the location fields:

```tsx
    const result      = await createJobPost({
      title:       fd.get('title') as string,
      description: fd.get('description') as string,
      category,
      budget:   Number(fd.get('budget')),
      deadline: new Date(deadlineRaw).toISOString(),
      isRemote: location.isRemote,
      address:   location.isRemote ? undefined : location.address,
      latitude:  location.isRemote ? undefined : location.latitude ?? undefined,
      longitude: location.isRemote ? undefined : location.longitude ?? undefined,
    })
```

- [ ] **Step 4: Render the picker after the Category block**

Immediately after the closing `</div>` of the Categoría block (the one that ends at line 142, before the "Presupuesto + Fecha" grid), insert:

```tsx
      {/* Ubicación */}
      <div className="space-y-3">
        <span className="block text-label-md text-on-surface">Ubicación</span>
        <LocationPicker value={location} onChange={setLocation} />
      </div>
```

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, log in as a CLIENT, go to `/dashboard/jobs/new`. Verify:
- The "Trabajo remoto / en línea" toggle hides/shows the address + map.
- The map renders with a draggable pin centered on San Salvador; clicking/dragging moves the pin.
- Dragging the pin auto-fills the address (Nominatim); manual edits to the address are preserved.
- Submitting a non-remote job without touching the map shows the friendly location error.
- Submitting a valid non-remote job (or a remote job) succeeds and redirects to the pay page.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/jobs/new/new-job-form.tsx
git commit -m "feat(jobs): add location picker to new job form"
```

---

## Notes / caveats (from spec)

- Nominatim is rate-limited and for low volume only; reverse-geocode failures degrade gracefully (pin stays, user types address). Production should send a descriptive `User-Agent`/`Referer` or move to a self-hosted/paid geocoder.
- The authoritative location is the pin coordinates + submitted address text.
- Out of scope: showing location on detail/search pages, geocoding caching, forward address search, KYC.
