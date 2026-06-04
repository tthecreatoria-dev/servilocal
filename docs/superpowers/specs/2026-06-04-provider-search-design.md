# Provider Search by Skill + Location — Design

**Date:** 2026-06-04
**Status:** Approved, pending implementation plan

## Problem

The homepage hero has a search form (`src/app/page.tsx`) with a free-text "skill"
field and a "where" field, currently posting to `/jobs` (job posts). The product
goal is the opposite direction: a client should be able to search for **workers
(providers)** who have a given skill and operate **near** a typed location.

Two gaps in the current code make this impossible today:

1. `ProviderProfile` stores `skills` but **no location** — and `User` has no
   address either. So providers can't be filtered geographically.
2. There is no page that lists providers; the form points at the job-post list.

## Decisions (confirmed with user)

- **Skill search** → a **category picker (dropdown)**, matched exactly against
  `ProviderProfile.skills`. No free-text synonym mapping.
- **Location** → **true geo radius**. Providers register with coordinates; search
  resolves the typed address to coordinates and returns providers within a radius,
  sorted by distance.
- **Worker registration input** → reuse the existing `LocationPicker` (map +
  reverse geocoding), which yields `{ isRemote, address, latitude, longitude }`.

## Scope

In scope: provider location capture at registration, a provider search results
page, and rewiring the homepage hero form to drive it.

Out of scope: the pre-existing inconsistency where `CreateJobPostSchema` /
`new-job-form.tsx` reference 9 categories (MASONRY, ELECTRICAL, …) that are not in
the Prisma `ServiceCategory` enum. This feature uses the **6 real enum values**
that `ProviderProfile.skills` actually stores: PLUMBING, TEACHING, DELIVERY,
CLEANING, DESIGN, DIGITAL.

## Components

### 1. Data model — Prisma migration

Add to `ProviderProfile`:

```prisma
isRemote   Boolean  @default(false)
address    String?
latitude   Float?
longitude  Float?
```

These map 1:1 onto `LocationPicker`'s `LocationValue`. Columns are nullable in the
DB; the *required-for-providers* rule is enforced in validation (below), mirroring
how `JobPost` keeps `address/latitude/longitude` optional in the schema but
required via `CreateJobPostSchema.superRefine` when not remote.

### 2. Registration — worker enters address

- **`RegisterSchema`** (`src/types/schemas.ts`): add optional `address` (string,
  5–200 chars), `latitude` (-90..90), `longitude` (-180..180), `isRemote`
  (boolean, default false). Add a `superRefine`: when `role === 'PROVIDER'` and
  `isRemote` is false, `address`, `latitude`, and `longitude` are all required.
- **`register-form.tsx`**: render `LocationPicker` only when `role === 'PROVIDER'`,
  placed near the skills selector. Drive it with local `LocationValue` state.
  Submit values via hidden inputs for `latitude`, `longitude`, `isRemote`; the
  picker's built-in `address` input already submits as `name="address"`.
- **`registerAndLogin`** (`src/actions/auth.ts`): read `address`, `latitude`,
  `longitude`, `isRemote` from `FormData` (numbers parsed/validated through Zod),
  and pass them through to `register()`.
- **`register()`**: when creating the `providerProfile`, include `isRemote`,
  `address`, `latitude`, `longitude`.

### 3. Homepage hero form — `src/app/page.tsx`

The page is an async server component, so a plain GET form with a native `<select>`
works with no client JS.

- `action="/providers"`, `method="GET"`.
- Replace the free-text skill `<input name="q">` with `<select name="category">`
  listing the 6 `ServiceCategory` values, labelled via `t('serviceCategory.*')`,
  with a "todas las categorías" default (empty value).
- Keep the location `<input name="location">` and the submit button as-is.

### 4. New results page — `/providers`

Location: `src/app/(marketplace)/providers/page.tsx` (public, async server
component). `searchParams: { category?: string; location?: string }`.

Flow:

1. Validate `category` against the `ServiceCategory` enum → `validCategory` or
   undefined.
2. If `location` is a non-empty string, **forward-geocode** it to `{ lat, lng }`
   using a new `src/lib/geocode.ts`.
3. Query `providerProfile.findMany` where `skills has validCategory` (when
   present), `include: { user: { select: { name: true } } }`.
4. For each provider with coordinates, compute `haversineKm` to the search point.
   Keep providers within the default **25 km** radius, sorted ascending by
   distance, then by rating desc. **Remote** providers (`isRemote === true`) are
   always included and appended after the near-by results, sorted by rating.
5. If no `location` was typed, or geocoding failed, skip the geo filter: show all
   providers of the category sorted by rating desc, and render a small notice when
   geocoding failed.
6. Render each provider with a `provider-card.tsx` feature component: name,
   skill chips, ⭐ rating + review count, and distance ("a 3.2 km") or address /
   "En línea" for remote.

Empty state: reuse the existing marketplace empty-state pattern (icon + message +
link back to `/providers`).

### 5. New lib — `src/lib/geocode.ts`

Server-only helpers:

- `geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null>` —
  calls Nominatim `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=…`
  with an explicit `User-Agent` header (Nominatim usage policy) and
  `Accept-Language: es`. Returns null on any failure (network, no match, parse).
- `haversineKm(a: {lat,lng}, b: {lat,lng}): number` — great-circle distance in km.

Both pure/typed; `geocodeAddress` swallows errors and returns null so the page can
degrade to the "show all" path.

## Data flow

```
Homepage hero form (GET) ──category, location──▶ /providers page (server)
  /providers:
    location ──geocodeAddress()──▶ {lat,lng}
    db.providerProfile.findMany({ skills has category })
      ──haversineKm() per provider──▶ filter ≤25km + sort
    ──▶ render provider cards
```

Registration:

```
register-form (LocationPicker) ──address,lat,lng,isRemote──▶ registerAndLogin
  ──RegisterSchema (superRefine: required for non-remote PROVIDER)──▶ register()
  ──▶ providerProfile.create({ skills, isRemote, address, latitude, longitude })
```

## Error handling

- Geocode failure or empty location → degrade to "all providers of category,
  sorted by rating", with a non-blocking notice. Never throw to the user.
- Invalid `category` query value → treated as "no category filter".
- Provider with null coordinates and not remote → excluded from geo-filtered
  results (cannot compute distance); still listed in the no-location path.
- Registration: Zod `superRefine` blocks non-remote providers without coords;
  surfaced as a field error in the form (reuse existing `fieldErrors` mechanism).

## Testing

- `geocode.ts`: unit-test `haversineKm` against known city pairs; test
  `geocodeAddress` with mocked `fetch` (success, no-match, network error → null).
- `RegisterSchema`: provider-without-coords (non-remote) fails; provider-remote
  passes; client without coords passes.
- `register()` / `registerAndLogin`: provider registration persists location;
  follow existing `src/actions/__tests__/auth.test.ts` patterns.
- `/providers` page query logic: extract the sort/filter into a pure helper so it
  can be unit-tested (skill filter, radius cutoff, remote-appended ordering)
  without a live DB.

## Trade-offs / future work

- Distance is computed in JS over the skill-filtered candidate set — adequate at
  early scale. If provider counts grow, move to PostGIS or the Postgres
  `earthdistance`/`cube` extensions with a raw query.
- Forward geocoding hits Nominatim per search with no caching. Acceptable for low
  volume; add a short-lived cache or a paid geocoder if traffic grows.
- A 25 km radius is a hardcoded constant for now; could become a UI control later.
