# Provider Search by Skill + Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client search the homepage for workers (providers) who have a chosen skill and operate near a typed location, returning them ranked by distance.

**Architecture:** Providers gain location columns captured at registration via the existing `LocationPicker`. A new public `/providers` page forward-geocodes the searched address (Nominatim), filters providers by skill in the DB, then ranks the candidate set by Haversine distance in JS. The homepage hero form is rewired from `/jobs` to `/providers` with a category `<select>`.

**Tech Stack:** Next.js 15 App Router (server components), Prisma/PostgreSQL, Zod, Vitest, Tailwind, Nominatim (OpenStreetMap) for geocoding.

---

## File Structure

- **Create** `src/lib/geocode.ts` — `geocodeAddress()` (forward geocode) + `haversineKm()`. Server-only, error-swallowing.
- **Create** `src/lib/provider-search.ts` — pure `rankProviders()` ranking/sorting helper (no DB, no network) so it is unit-testable.
- **Create** `src/lib/__tests__/geocode.test.ts`, `src/lib/__tests__/provider-search.test.ts`.
- **Create** `src/components/features/provider-card.tsx` — presentational provider card.
- **Create** `src/app/(marketplace)/providers/page.tsx` — search results page.
- **Modify** `prisma/schema.prisma` — add location fields to `ProviderProfile` (+ migration).
- **Modify** `src/types/schemas.ts` — `RegisterSchema` location fields + `superRefine`.
- **Modify** `src/actions/auth.ts` — read + persist location on provider registration.
- **Modify** `src/app/(auth)/register/register-form.tsx` — `LocationPicker` for providers.
- **Modify** `src/app/page.tsx` — hero form → `/providers`, category `<select>`.
- **Modify** `src/actions/__tests__/auth.test.ts` — provider-registration location assertions.

**Convention notes (match existing code):**
- The sibling `(marketplace)/jobs/page.tsx` **hardcodes Spanish category labels** in a `CATEGORY_LABELS` map rather than using i18n. The new `/providers` page and `provider-card` follow that same pattern (no `messages/*.json` edits).
- The homepage `page.tsx` already uses `t('serviceCategory.*')` (HomePage namespace, keys already exist for the 6 categories) — the new `<select>` option labels reuse those.
- Categories used here are the **6 real `ServiceCategory` enum values**: PLUMBING, TEACHING, DELIVERY, CLEANING, DESIGN, DIGITAL.

---

## Task 1: Add location fields to ProviderProfile

**Files:**
- Modify: `prisma/schema.prisma:149-160` (`ProviderProfile` model)
- Create: `prisma/migrations/20260604000000_provider_location_fields/migration.sql`

- [ ] **Step 1: Edit the Prisma model**

In `prisma/schema.prisma`, change the `ProviderProfile` model so the fields block reads:

```prisma
model ProviderProfile {
  id           String            @id @default(cuid())
  userId       String            @unique
  bio          String            @default("")
  skills       ServiceCategory[]
  rating       Float             @default(0)
  totalReviews Int               @default(0)
  isRemote     Boolean           @default(false)
  address      String?
  latitude     Float?
  longitude    Float?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  services     Service[]
}
```

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260604000000_provider_location_fields/migration.sql` (mirrors the existing `20260603000000_job_location_fields` migration):

```sql
-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "isRemote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
```

- [ ] **Step 3: Regenerate the Prisma client and apply**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

If a database is reachable, also run: `npx prisma migrate deploy`
Expected: the `20260604000000_provider_location_fields` migration applies cleanly. (If no DB is reachable in this environment, the generate step is sufficient to unblock the type-level work; the migration file is already in place for deployment.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260604000000_provider_location_fields/migration.sql
git commit -m "feat(schema): add location fields to ProviderProfile"
```

---

## Task 2: Geocoding library (`geocode.ts`)

**Files:**
- Create: `src/lib/geocode.ts`
- Test: `src/lib/__tests__/geocode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/geocode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { haversineKm, geocodeAddress } from '@/lib/geocode'

describe('haversineKm()', () => {
  it('returns ~0 for identical points', () => {
    const p = { lat: 13.6929, lng: -89.2182 }
    expect(haversineKm(p, p)).toBeCloseTo(0, 5)
  })

  it('computes the San Salvador → Santa Ana distance (~55 km)', () => {
    const sanSalvador = { lat: 13.6929, lng: -89.2182 }
    const santaAna = { lat: 13.9942, lng: -89.5597 }
    const km = haversineKm(sanSalvador, santaAna)
    expect(km).toBeGreaterThan(45)
    expect(km).toBeLessThan(65)
  })
})

describe('geocodeAddress()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the first result coordinates on success', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '13.6929', lon: '-89.2182' }],
    })
    const result = await geocodeAddress('San Salvador')
    expect(result).toEqual({ lat: 13.6929, lng: -89.2182 })
  })

  it('returns null when there are no matches', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    expect(await geocodeAddress('asdfqwer')).toBeNull()
  })

  it('returns null on a non-ok response', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    expect(await geocodeAddress('San Salvador')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))
    expect(await geocodeAddress('San Salvador')).toBeNull()
  })

  it('returns null for an empty query without calling fetch', async () => {
    const result = await geocodeAddress('   ')
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/geocode.test.ts`
Expected: FAIL — cannot resolve `@/lib/geocode`.

- [ ] **Step 3: Implement the library**

Create `src/lib/geocode.ts`:

```ts
// Forward geocoding + great-circle distance for provider search.
// Server-only: hits Nominatim (OpenStreetMap). All failures degrade to null.

export type LatLng = { lat: number; lng: number }

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const q = query.trim()
  if (q.length === 0) return null

  try {
    const url = `${NOMINATIM_SEARCH}?format=json&limit=1&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'ServiLocal/1.0 (provider-search)',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const first = data[0]
    if (!first?.lat || !first?.lon) return null
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/geocode.test.ts`
Expected: PASS (9 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocode.ts src/lib/__tests__/geocode.test.ts
git commit -m "feat(lib): add geocodeAddress and haversineKm helpers"
```

---

## Task 3: Provider ranking helper (`provider-search.ts`)

**Files:**
- Create: `src/lib/provider-search.ts`
- Test: `src/lib/__tests__/provider-search.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/provider-search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rankProviders, DEFAULT_RADIUS_KM, type ProviderForRanking } from '@/lib/provider-search'

function provider(overrides: Partial<ProviderForRanking>): ProviderForRanking {
  return {
    id: 'p',
    name: 'Provider',
    bio: '',
    skills: ['PLUMBING'],
    rating: 4,
    totalReviews: 1,
    isRemote: false,
    address: 'Somewhere',
    latitude: 13.6929,
    longitude: -89.2182,
    ...overrides,
  }
}

const SEARCH = { lat: 13.6929, lng: -89.2182 } // San Salvador

describe('rankProviders()', () => {
  it('without a search point, sorts by rating desc then reviews desc, distance null', () => {
    const result = rankProviders(
      [
        provider({ id: 'a', rating: 4.2, totalReviews: 3 }),
        provider({ id: 'b', rating: 4.8, totalReviews: 1 }),
        provider({ id: 'c', rating: 4.2, totalReviews: 9 }),
      ],
      null,
    )
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a'])
    expect(result.every((p) => p.distanceKm === null)).toBe(true)
  })

  it('with a search point, returns nearby non-remote providers sorted by distance', () => {
    const near = provider({ id: 'near', latitude: 13.70, longitude: -89.22 })
    const far = provider({ id: 'far', latitude: 13.99, longitude: -89.56 }) // ~55 km
    const result = rankProviders([far, near], SEARCH, DEFAULT_RADIUS_KM)
    expect(result.map((p) => p.id)).toEqual(['near'])
    expect(result[0].distanceKm).toBeGreaterThan(0)
  })

  it('excludes non-remote providers outside the radius', () => {
    const far = provider({ id: 'far', latitude: 13.99, longitude: -89.56 })
    const result = rankProviders([far], SEARCH, 10)
    expect(result).toEqual([])
  })

  it('excludes non-remote providers without coordinates when searching by location', () => {
    const noCoords = provider({ id: 'x', latitude: null, longitude: null })
    expect(rankProviders([noCoords], SEARCH)).toEqual([])
  })

  it('always appends remote providers after nearby ones, sorted by rating, distance null', () => {
    const near = provider({ id: 'near', latitude: 13.70, longitude: -89.22 })
    const remoteHi = provider({ id: 'rh', isRemote: true, rating: 5, latitude: null, longitude: null })
    const remoteLo = provider({ id: 'rl', isRemote: true, rating: 3, latitude: null, longitude: null })
    const result = rankProviders([remoteLo, near, remoteHi], SEARCH)
    expect(result.map((p) => p.id)).toEqual(['near', 'rh', 'rl'])
    expect(result.find((p) => p.id === 'rh')?.distanceKm).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/provider-search.test.ts`
Expected: FAIL — cannot resolve `@/lib/provider-search`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/provider-search.ts`:

```ts
import { haversineKm, type LatLng } from './geocode'
import type { ServiceCategory } from '@/types/index'

export const DEFAULT_RADIUS_KM = 25

export type ProviderForRanking = {
  id: string
  name: string
  bio: string
  skills: ServiceCategory[]
  rating: number
  totalReviews: number
  isRemote: boolean
  address: string | null
  latitude: number | null
  longitude: number | null
}

export type RankedProvider = ProviderForRanking & { distanceKm: number | null }

function byRating(a: ProviderForRanking, b: ProviderForRanking): number {
  if (b.rating !== a.rating) return b.rating - a.rating
  return b.totalReviews - a.totalReviews
}

export function rankProviders(
  providers: ProviderForRanking[],
  searchPoint: LatLng | null,
  radiusKm: number = DEFAULT_RADIUS_KM,
): RankedProvider[] {
  if (!searchPoint) {
    return [...providers]
      .sort(byRating)
      .map((p) => ({ ...p, distanceKm: null }))
  }

  const nearby: RankedProvider[] = []
  const remote: ProviderForRanking[] = []

  for (const p of providers) {
    if (p.isRemote) {
      remote.push(p)
      continue
    }
    if (p.latitude === null || p.longitude === null) continue
    const distanceKm = haversineKm(searchPoint, { lat: p.latitude, lng: p.longitude })
    if (distanceKm <= radiusKm) nearby.push({ ...p, distanceKm })
  }

  nearby.sort((a, b) => (a.distanceKm! - b.distanceKm!) || byRating(a, b))
  const remoteRanked: RankedProvider[] = remote
    .sort(byRating)
    .map((p) => ({ ...p, distanceKm: null }))

  return [...nearby, ...remoteRanked]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/provider-search.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/provider-search.ts src/lib/__tests__/provider-search.test.ts
git commit -m "feat(lib): add rankProviders distance ranking helper"
```

---

## Task 4: RegisterSchema location validation

**Files:**
- Modify: `src/types/schemas.ts:11-18` (`RegisterSchema`)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__` is not appropriate here — schema tests live alongside the schema usage. Create `src/types/__tests__/register-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RegisterSchema } from '@/types/schemas'

const base = {
  email: 'worker@example.com',
  password: 'password123',
  name: 'Worker One',
  phone: '+50379000000',
}

describe('RegisterSchema location rules', () => {
  it('accepts a CLIENT without location', () => {
    const parsed = RegisterSchema.safeParse({ ...base, role: 'CLIENT' })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-remote PROVIDER missing coordinates', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['PLUMBING'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts a non-remote PROVIDER with full location', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['PLUMBING'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.6929,
      longitude: -89.2182,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a remote PROVIDER without coordinates', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['DIGITAL'],
      isRemote: true,
    })
    expect(parsed.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/types/__tests__/register-schema.test.ts`
Expected: FAIL — the non-remote-without-coords case currently passes (no rule yet), so that test fails.

- [ ] **Step 3: Update the schema**

In `src/types/schemas.ts`, replace the `RegisterSchema` definition (lines 11-18) with:

```ts
export const RegisterSchema = z
  .object({
    email:     z.string().email('Invalid email address'),
    password:  z.string().min(8, 'Password must be at least 8 characters'),
    name:      z.string().min(2, 'Name must be at least 2 characters'),
    role:      z.enum(['CLIENT', 'PROVIDER']),
    phone:     z.string().min(7, 'Número de teléfono inválido'),
    skills:    z.array(z.enum(SKILL_VALUES)).optional(),
    isRemote:  z.boolean().optional().default(false),
    address:   z.string().min(5, 'Address must be at least 5 characters').max(200, 'Address must be at most 200 characters').optional(),
    latitude:  z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude').optional(),
    longitude: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'PROVIDER' || data.isRemote) return
    if (data.address === undefined) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Address is required for non-remote providers' })
    }
    if (data.latitude === undefined) {
      ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude is required for non-remote providers' })
    }
    if (data.longitude === undefined) {
      ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude is required for non-remote providers' })
    }
  })
```

(`SKILL_VALUES` is already defined just above in the file. `RegisterInput` type at the bottom continues to work via `z.infer`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/types/__tests__/register-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/types/__tests__/register-schema.test.ts
git commit -m "feat(schema): require provider location in RegisterSchema unless remote"
```

---

## Task 5: Persist provider location in the register action

**Files:**
- Modify: `src/actions/auth.ts:36-76` (`register`), `:123-180` (`registerAndLogin`)
- Modify: `src/actions/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/actions/__tests__/auth.test.ts` a test asserting provider location is persisted. Inside the existing `describe('registerAndLogin()')` block (mirror the existing mock style — `mockTransaction` runs the callback with a `tx` containing `user.create` and `providerProfile.create`). Add:

```ts
it('persists provider location on registration', async () => {
  mockFindUnique.mockResolvedValue(null)
  const providerCreate = vi.fn().mockResolvedValue(undefined)
  const userCreate = vi.fn().mockResolvedValue({ id: 'u1' })
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      user: { create: userCreate },
      providerProfile: { create: providerCreate },
    }),
  )

  const fd = makeFormData({
    email: 'worker@example.com',
    password: 'password123',
    name: 'Worker One',
    role: 'PROVIDER',
    phone: '+50379000000',
    isRemote: 'false',
    address: 'Col. Escalón, San Salvador',
    latitude: '13.6929',
    longitude: '-89.2182',
  })
  fd.append('skills', 'PLUMBING')

  await registerAndLogin(null, fd)

  expect(providerCreate).toHaveBeenCalledWith({
    data: {
      userId: 'u1',
      skills: ['PLUMBING'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.6929,
      longitude: -89.2182,
    },
  })
})
```

(If the test file's `vi.mock('@/lib/db')` does not already expose `$transaction: mockTransaction`, it does — see the top of the file. No mock wiring changes needed beyond using `mockTransaction.mockImplementation` in this test.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/actions/__tests__/auth.test.ts -t "persists provider location"`
Expected: FAIL — `providerProfile.create` is called without the location fields.

- [ ] **Step 3: Update `register()` to write location**

In `src/actions/auth.ts`, inside `register()`, replace the `providerProfile.create` call (currently `data: { userId: created.id, skills }`) with:

```ts
    if (parsed.data.role === 'PROVIDER') {
      const isRemote = parsed.data.isRemote ?? false
      await tx.providerProfile.create({
        data: {
          userId:    created.id,
          skills,
          isRemote,
          address:   isRemote ? null : (parsed.data.address ?? null),
          latitude:  isRemote ? null : (parsed.data.latitude ?? null),
          longitude: isRemote ? null : (parsed.data.longitude ?? null),
        },
      })
    }
```

- [ ] **Step 4: Read location from FormData in `registerAndLogin()`**

In `src/actions/auth.ts`, in `registerAndLogin()`, replace the `raw` object construction (lines ~131-138) with:

```ts
  const latRaw = formData.get('latitude')
  const lngRaw = formData.get('longitude')

  const raw = {
    email:     (formData.get('email')    ?? '') as string,
    password:  (formData.get('password') ?? '') as string,
    name:      (formData.get('name')     ?? '') as string,
    role:      (formData.get('role')     ?? '') as string,
    phone:     (formData.get('phone')    ?? '') as string,
    skills:    skillsRaw,
    isRemote:  formData.get('isRemote') === 'true',
    address:   typeof formData.get('address') === 'string' && (formData.get('address') as string).length > 0
      ? (formData.get('address') as string)
      : undefined,
    latitude:  typeof latRaw === 'string' && latRaw.length > 0 ? Number(latRaw) : undefined,
    longitude: typeof lngRaw === 'string' && lngRaw.length > 0 ? Number(lngRaw) : undefined,
  }
```

Then, in the field-error mapping loop just below, add a branch so a missing-location issue surfaces (optional but recommended): after the `phone` branch add:

```ts
      else if (field === 'address' || field === 'latitude' || field === 'longitude') {
        fieldErrors.address = 'Marca tu ubicación en el mapa o activa trabajo remoto'
      }
```

And add `address` to the `AuthState['fieldErrors']` type at the top of the file (around line 22-29):

```ts
export type AuthState = {
  fieldErrors?: {
    email?: string
    password?: string
    name?: string
    phone?: string
    skills?: string
    address?: string
  }
  error?: string
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/actions/__tests__/auth.test.ts`
Expected: PASS — all existing auth tests plus the new provider-location test.

- [ ] **Step 6: Commit**

```bash
git add src/actions/auth.ts src/actions/__tests__/auth.test.ts
git commit -m "feat(auth): persist provider location on registration"
```

---

## Task 6: LocationPicker in the registration form

**Files:**
- Modify: `src/app/(auth)/register/register-form.tsx`

- [ ] **Step 1: Add imports and location state**

At the top of `src/app/(auth)/register/register-form.tsx`, add the import (after the existing imports):

```ts
import { LocationPicker, type LocationValue } from '@/components/features/location-picker'
```

Inside the `RegisterForm` component, after the existing `useState` hooks (after `phoneNumber`), add:

```ts
  const [location, setLocation] = useState<LocationValue>({
    isRemote:  false,
    address:   '',
    latitude:  null,
    longitude: null,
  })
```

- [ ] **Step 2: Render the picker and hidden inputs (providers only)**

In the JSX, inside the existing `{role === 'PROVIDER' && ( … )}` block that renders the skills selector, add the location picker **after** the skills grid `<div>` (still inside the same `PROVIDER` conditional, so it appears under the skills). Insert this block right before the closing of that provider section:

```tsx
        {role === 'PROVIDER' && (
          <div>
            <label className="text-label-md text-on-surface-variant block mb-2">
              Mi ubicación
              <span className="text-label-sm text-on-surface-variant/60 ml-1">(dónde ofreces tus servicios)</span>
            </label>
            <input type="hidden" name="isRemote" value={location.isRemote ? 'true' : 'false'} />
            {location.latitude !== null && (
              <input type="hidden" name="latitude" value={location.latitude} />
            )}
            {location.longitude !== null && (
              <input type="hidden" name="longitude" value={location.longitude} />
            )}
            <LocationPicker value={location} onChange={setLocation} />
            {state?.fieldErrors?.address && (
              <p className="text-red-600 text-label-sm mt-1">{state.fieldErrors.address}</p>
            )}
          </div>
        )}
```

Note: `LocationPicker` already renders an `<input name="address">`, so the address text is submitted automatically. The picker also renders its own `isRemote` checkbox bound to `location.isRemote`; the hidden `isRemote` input above forwards that value to the server action.

- [ ] **Step 3: Manually verify the form renders**

Run: `npm run dev`
Open `http://localhost:3000/register`, toggle the role to **Proveedor**.
Expected: the skills grid appears, and below it the "Mi ubicación" section with the remote checkbox, address input, and Leaflet map. Toggling "Trabajo remoto" hides the map.

- [ ] **Step 4: Verify the build/lint passes**

Run: `npm run lint`
Expected: no errors in `register-form.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/register/register-form.tsx"
git commit -m "feat(register): add location picker for provider signups"
```

---

## Task 7: Provider card component

**Files:**
- Create: `src/components/features/provider-card.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/features/provider-card.tsx`:

```tsx
import type { ServiceCategory } from '@/types/index'
import type { RankedProvider } from '@/lib/provider-search'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const CATEGORY_ICONS: Record<ServiceCategory, string> = {
  PLUMBING: 'plumbing',
  TEACHING: 'school',
  DELIVERY: 'local_shipping',
  CLEANING: 'cleaning_services',
  DESIGN:   'palette',
  DIGITAL:  'computer',
}

export function ProviderCard({ provider }: { provider: RankedProvider }) {
  const locationLabel =
    provider.distanceKm !== null
      ? `a ${provider.distanceKm.toFixed(1)} km`
      : provider.isRemote
        ? 'En línea'
        : (provider.address ?? 'Ubicación no especificada')

  return (
    <article className="card-hover bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-label-md text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
          {provider.name}
        </h2>
        <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
          <span
            className="material-symbols-outlined text-[16px] text-secondary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            star
          </span>
          {provider.rating.toFixed(1)}
          <span className="text-on-surface-variant/60">({provider.totalReviews})</span>
        </span>
      </div>

      {provider.bio && (
        <p className="text-body-md text-on-surface-variant line-clamp-2 mb-4">{provider.bio}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {provider.skills.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-full text-label-sm text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[14px]">{CATEGORY_ICONS[skill]}</span>
            {CATEGORY_LABELS[skill]}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 pt-3 border-t border-outline-variant mt-auto text-label-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px]">location_on</span>
        {locationLabel}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Verify lint/build**

Run: `npm run lint`
Expected: no errors in `provider-card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/provider-card.tsx
git commit -m "feat(ui): add ProviderCard component"
```

---

## Task 8: Provider search results page (`/providers`)

**Files:**
- Create: `src/app/(marketplace)/providers/page.tsx`

- [ ] **Step 1: Implement the page**

Create `src/app/(marketplace)/providers/page.tsx`:

```tsx
import Link from 'next/link'
import { db } from '@/lib/db'
import { geocodeAddress } from '@/lib/geocode'
import { rankProviders, type ProviderForRanking } from '@/lib/provider-search'
import { ProviderCard } from '@/components/features/provider-card'
import type { ServiceCategory } from '@/types/index'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  PLUMBING: 'Fontanería',
  TEACHING: 'Enseñanza',
  DELIVERY: 'Delivery',
  CLEANING: 'Limpieza',
  DESIGN:   'Diseño',
  DIGITAL:  'Digital',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ServiceCategory[]

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; location?: string }>
}) {
  const { category, location } = await searchParams

  const validCategory = CATEGORIES.includes(category as ServiceCategory)
    ? (category as ServiceCategory)
    : undefined

  const locationQuery = location?.trim() || undefined
  const searchPoint = locationQuery ? await geocodeAddress(locationQuery) : null
  const geocodeFailed = Boolean(locationQuery) && searchPoint === null

  const rows = await db.providerProfile.findMany({
    where: validCategory ? { skills: { has: validCategory } } : {},
    include: { user: { select: { name: true } } },
  })

  const candidates: ProviderForRanking[] = rows.map((row) => ({
    id:           row.id,
    name:         row.user.name,
    bio:          row.bio,
    skills:       row.skills as ServiceCategory[],
    rating:       row.rating,
    totalReviews: row.totalReviews,
    isRemote:     row.isRemote,
    address:      row.address,
    latitude:     row.latitude,
    longitude:    row.longitude,
  }))

  const providers = rankProviders(candidates, searchPoint)

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary">
          Profesionales disponibles
        </h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Encuentra trabajadores con la habilidad que necesitas cerca de ti.
        </p>
      </div>

      {/* Search bar — plain GET form, mirrors /jobs */}
      <form method="GET" action="/providers" className="mb-6 flex flex-col sm:flex-row gap-3 max-w-2xl">
        <select
          name="category"
          defaultValue={validCategory ?? ''}
          className="bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3.5 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
            location_on
          </span>
          <input
            name="location"
            defaultValue={locationQuery}
            placeholder="¿Dónde? Ej: San Salvador"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-28 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            type="submit"
            className="btn-press absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md hover:opacity-90 transition-opacity"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* Notices */}
      {geocodeFailed && (
        <p className="text-label-sm text-on-surface-variant mb-4">
          No pudimos ubicar <strong className="text-on-surface">&quot;{locationQuery}&quot;</strong>.
          Mostrando todos los profesionales{validCategory ? ` de ${CATEGORY_LABELS[validCategory]}` : ''}.
        </p>
      )}
      {!geocodeFailed && (validCategory || locationQuery) && (
        <p className="text-label-sm text-on-surface-variant mb-4">
          {providers.length} resultado{providers.length !== 1 ? 's' : ''}
          {validCategory && <> en <strong className="text-on-surface">{CATEGORY_LABELS[validCategory]}</strong></>}
          {searchPoint && <> cerca de <strong className="text-on-surface">{locationQuery}</strong></>}
          {' · '}
          <Link href="/providers" className="text-primary hover:underline">Limpiar filtros</Link>
        </p>
      )}

      {/* Results */}
      {providers.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">person_off</span>
          <p className="text-headline-md text-on-surface-variant">No hay profesionales disponibles</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            Intenta con otra categoría o amplía tu zona de búsqueda.
          </p>
          <Link
            href="/providers"
            className="btn-press mt-2 bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            Ver todos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify lint/build**

Run: `npm run lint`
Expected: no errors in `providers/page.tsx`.

- [ ] **Step 3: Manually verify (if DB seeded with providers)**

Run: `npm run dev`
Open `http://localhost:3000/providers?category=PLUMBING&location=San%20Salvador`.
Expected: plumbers near San Salvador, each card showing a distance like "a 3.2 km"; remote providers (if any) appear after with "En línea". An unmatched location (e.g. `location=zzzz`) shows the fallback notice and all category providers.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketplace)/providers/page.tsx"
git commit -m "feat(providers): add provider search results page"
```

---

## Task 9: Rewire the homepage hero form

**Files:**
- Modify: `src/app/page.tsx:138-170` (the search `<form>`)

- [ ] **Step 1: Replace the form**

In `src/app/page.tsx`, replace the entire `{/* Search bar */}` form (lines 137-170) with a GET form pointing at `/providers`, with the skill field as a `<select>`:

```tsx
            {/* Search bar */}
            <form
              method="GET"
              action="/providers"
              className="hero-item hero-item-3 w-full max-w-2xl bg-surface-container-lowest rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row gap-0 md:gap-2 shadow-sm border border-outline-variant"
            >
              <div className="flex-1 flex items-center px-4 py-3 border-b md:border-b-0 md:border-r border-outline-variant">
                <span className="material-symbols-outlined text-outline mr-2 flex-shrink-0">
                  search
                </span>
                <select
                  name="category"
                  defaultValue=""
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md outline-none"
                >
                  <option value="">{t('searchService')}</option>
                  {(['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL'] as const).map(
                    (cat) => (
                      <option key={cat} value={cat}>
                        {t(`serviceCategory.${cat}`)}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="flex-1 flex items-center px-4 py-3 border-b md:border-b-0 border-outline-variant">
                <span className="material-symbols-outlined text-outline mr-2 flex-shrink-0">
                  location_on
                </span>
                <input
                  name="location"
                  type="text"
                  placeholder={t('searchLocation')}
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md outline-none placeholder:text-on-surface-variant/60"
                />
              </div>
              <button
                type="submit"
                className="btn-press bg-secondary text-on-secondary px-8 py-3 mt-2 md:mt-0 rounded-xl md:rounded-full text-label-md hover:bg-primary transition-colors duration-200 w-full md:w-auto"
              >
                {t('searchButton')}
              </button>
            </form>
```

- [ ] **Step 2: Verify lint/build**

Run: `npm run lint`
Expected: no errors in `page.tsx`.

- [ ] **Step 3: Manually verify end-to-end**

Run: `npm run dev`
On `http://localhost:3000`, pick a category, type a city in the location field, press the search button.
Expected: navigates to `/providers?category=…&location=…` and shows matching providers.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): point hero search at provider results with category select"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass, including the new geocode, provider-search, register-schema, and auth tests.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Type-check via build (optional, if a DB/env is available)**

Run: `npm run build`
Expected: compiles with no TypeScript errors. (Requires Prisma client generated from Task 1.)

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), register validation (Task 3), register persistence (Task 5), register UI (Task 6), geocode lib (Task 2), ranking lib (Task 3→provider-search), `/providers` page (Task 8), homepage rewire (Task 9), provider-card (Task 7), geocode.ts (Task 2). All spec sections map to a task.
- **Type consistency:** `LatLng`, `ProviderForRanking`, `RankedProvider`, `rankProviders`, `geocodeAddress`, `haversineKm`, `DEFAULT_RADIUS_KM` are defined in Tasks 2-3 and consumed unchanged in Tasks 7-8. `AuthState.fieldErrors.address` added in Task 5 is consumed in Task 6.
- **Out of scope (per spec):** the 9-vs-6 category mismatch in `CreateJobPostSchema` is intentionally untouched; provider work uses the 6 real enum values throughout.
```
