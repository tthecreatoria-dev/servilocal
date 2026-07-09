# Profile Hub + Provider Services Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The header username button leads to `/dashboard/profile`, where providers manage the services they offer (title, description, price, category, active flag); the dashboard nav gains a "Mi perfil" tab.

**Architecture:** New server actions in `src/actions/services.ts` (create/update/toggle) validated with Zod, a client component `services-manager.tsx` rendered inside the existing profile page for providers, and two small nav edits. The public provider page already renders active services and needs no changes.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma, Zod, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-08-profile-services-design.md`

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`, no unexplained type assertions.
- Named exports only — no default exports (Next.js `page.tsx`/`route.ts` files are the framework-mandated exception, already used in this repo).
- Zod validation on every external input; server actions for mutations.
- Actions return `ActionResult<T>` from `@/types/index`: `{ success: true, data } | { success: false, error }` with short machine-readable error codes (`'unauthorized'`, `'forbidden'`, `'validation'`, …).
- UI copy in Spanish, matching existing tone ("Mis servicios", "Guardar", …).
- Forms call the action then `router.refresh()` — this repo does NOT use `revalidatePath` in actions (all pages involved are dynamic; the spec's "revalidate" requirement is satisfied by `router.refresh()` + dynamic rendering).
- Prisma `Decimal` values must be converted with `Number(...)` before crossing into client components.
- Run tests with `npx vitest run <path>`; full suite with `npm test`.

---

### Task 1: Zod schemas for service updates

**Files:**
- Modify: `src/types/schemas.ts` (after `CreateServiceSchema`, ~line 51; type exports block ~line 145)
- Test: `src/types/__tests__/schemas.test.ts` (append)

**Interfaces:**
- Consumes: existing `CreateServiceSchema`, `SERVICE_CATEGORY_VALUES` (both already in `src/types/schemas.ts`).
- Produces: `UpdateServiceSchema` (object: `id: string cuid` + all `CreateServiceSchema` fields), `ToggleServiceActiveSchema` (`{ id: string cuid, isActive: boolean }`), types `UpdateServiceInput`, `ToggleServiceActiveInput`.

- [ ] **Step 1: Write the failing tests**

Append to `src/types/__tests__/schemas.test.ts`:

```ts
import { UpdateServiceSchema, ToggleServiceActiveSchema } from '@/types/schemas'

describe('UpdateServiceSchema', () => {
  const valid = {
    id: 'cjld2cjxh0000qzrmn831i7rn',
    title: 'Reparación de fugas',
    description: 'Detección y reparación de fugas de agua en tuberías residenciales.',
    price: 25,
    category: 'PLUMBING',
  }

  it('accepts a valid update', () => {
    expect(UpdateServiceSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a non-cuid id', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false)
  })

  it('rejects a short title', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, title: 'Fix' }).success).toBe(false)
  })

  it('rejects a non-positive price', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, price: 0 }).success).toBe(false)
  })

  it('rejects an unknown category', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, category: 'MAGIC' }).success).toBe(false)
  })
})

describe('ToggleServiceActiveSchema', () => {
  it('accepts a valid toggle', () => {
    expect(
      ToggleServiceActiveSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn', isActive: false }).success,
    ).toBe(true)
  })

  it('rejects a non-boolean isActive', () => {
    expect(
      ToggleServiceActiveSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn', isActive: 'yes' }).success,
    ).toBe(false)
  })
})
```

Note: the existing file already imports `describe, it, expect` from vitest — merge the new schema names into the existing `@/types/schemas` import instead of adding a duplicate import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: FAIL — `UpdateServiceSchema` is not exported.

- [ ] **Step 3: Implement the schemas**

In `src/types/schemas.ts`, directly after the `CreateServiceSchema` definition:

```ts
export const UpdateServiceSchema = CreateServiceSchema.extend({
  id: z.string().cuid('Invalid service ID'),
})

export const ToggleServiceActiveSchema = z.object({
  id: z.string().cuid('Invalid service ID'),
  isActive: z.boolean(),
})
```

In the type-exports block at the bottom, next to `CreateServiceInput`:

```ts
export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>
export type ToggleServiceActiveInput = z.infer<typeof ToggleServiceActiveSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/types/__tests__/schemas.test.ts`
Expected: PASS (all, including pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/types/__tests__/schemas.test.ts
git commit -m "feat(services): add UpdateServiceSchema and ToggleServiceActiveSchema"
```

---

### Task 2: Server actions — create, update, toggle service

**Files:**
- Create: `src/actions/services.ts`
- Test: `src/actions/__tests__/services.test.ts`

**Interfaces:**
- Consumes: `CreateServiceSchema`, `UpdateServiceSchema`, `ToggleServiceActiveSchema` + input types (Task 1); `auth` from `@/lib/auth`; `db` from `@/lib/db`; `ActionResult` from `@/types/index`.
- Produces:
  - `createService(data: CreateServiceInput): Promise<ActionResult<null>>`
  - `updateService(data: UpdateServiceInput): Promise<ActionResult<null>>`
  - `toggleServiceActive(data: ToggleServiceActiveInput): Promise<ActionResult<null>>`
  - Error codes: `'unauthorized'`, `'forbidden'`, `'validation'`, `'profile_not_found'` (create only), `'service_not_found'` (update/toggle — also returned when the service belongs to another provider, to avoid leaking existence).

- [ ] **Step 1: Write the failing tests**

Create `src/actions/__tests__/services.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockProfileFindUnique = vi.hoisted(() => vi.fn())
const mockServiceFindUnique = vi.hoisted(() => vi.fn())
const mockServiceCreate = vi.hoisted(() => vi.fn())
const mockServiceUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    providerProfile: { findUnique: mockProfileFindUnique },
    service: {
      findUnique: mockServiceFindUnique,
      create: mockServiceCreate,
      update: mockServiceUpdate,
    },
  },
}))

import { createService, updateService, toggleServiceActive } from '@/actions/services'

const SERVICE_ID = 'cjld2cjxh0000qzrmn831i7rn'

const validCreate = {
  title: 'Reparación de fugas',
  description: 'Detección y reparación de fugas de agua en tuberías residenciales.',
  price: 25,
  category: 'PLUMBING' as const,
}

const validUpdate = { ...validCreate, id: SERVICE_ID }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createService()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await createService(validCreate)).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await createService(validCreate)).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await createService({ ...validCreate, price: -5 }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('rejects a PROVIDER without a profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await createService(validCreate)).toEqual({ success: false, error: 'profile_not_found' })
  })

  it('creates the service linked to the provider profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockProfileFindUnique.mockResolvedValue({ id: 'profile_1' })
    mockServiceCreate.mockResolvedValue({})
    const result = await createService(validCreate)
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceCreate).toHaveBeenCalledWith({
      data: { ...validCreate, providerId: 'profile_1' },
    })
  })
})

describe('updateService()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await updateService({ ...validUpdate, id: 'nope' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('rejects a service that does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue(null)
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'service_not_found' })
  })

  it("rejects another provider's service", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_2' } })
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'service_not_found' })
    expect(mockServiceUpdate).not.toHaveBeenCalled()
  })

  it('updates an owned service', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_1' } })
    mockServiceUpdate.mockResolvedValue({})
    const result = await updateService(validUpdate)
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: SERVICE_ID },
      data: {
        title: validCreate.title,
        description: validCreate.description,
        price: validCreate.price,
        category: validCreate.category,
      },
    })
  })
})

describe('toggleServiceActive()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    // @ts-expect-error — validación en runtime de entrada externa
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: 'yes' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it("rejects another provider's service", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_2' } })
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'service_not_found' })
  })

  it('toggles an owned service', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_1' } })
    mockServiceUpdate.mockResolvedValue({})
    const result = await toggleServiceActive({ id: SERVICE_ID, isActive: false })
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: SERVICE_ID },
      data: { isActive: false },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/__tests__/services.test.ts`
Expected: FAIL — cannot resolve `@/actions/services`.

- [ ] **Step 3: Implement the actions**

Create `src/actions/services.ts`:

```ts
'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  CreateServiceSchema,
  UpdateServiceSchema,
  ToggleServiceActiveSchema,
} from '@/types/schemas'
import type {
  CreateServiceInput,
  UpdateServiceInput,
  ToggleServiceActiveInput,
} from '@/types/schemas'
import type { ActionResult } from '@/types/index'

export async function createService(data: CreateServiceInput): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = CreateServiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: 'profile_not_found' }

  await db.service.create({
    data: { ...parsed.data, providerId: profile.id },
  })
  return { success: true, data: null }
}

// Devuelve 'service_not_found' también cuando el servicio es de otro proveedor,
// para no revelar la existencia de servicios ajenos.
async function ownsService(serviceId: string, userId: string): Promise<boolean> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: { provider: { select: { userId: true } } },
  })
  return service?.provider.userId === userId
}

export async function updateService(data: UpdateServiceInput): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = UpdateServiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  if (!(await ownsService(parsed.data.id, session.user.id))) {
    return { success: false, error: 'service_not_found' }
  }

  const { id, ...fields } = parsed.data
  await db.service.update({ where: { id }, data: fields })
  return { success: true, data: null }
}

export async function toggleServiceActive(
  data: ToggleServiceActiveInput,
): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = ToggleServiceActiveSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  if (!(await ownsService(parsed.data.id, session.user.id))) {
    return { success: false, error: 'service_not_found' }
  }

  await db.service.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  })
  return { success: true, data: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/__tests__/services.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/actions/services.ts src/actions/__tests__/services.test.ts
git commit -m "feat(services): server actions to create, update and toggle provider services"
```

---

### Task 3: "Mis servicios" section in the profile page

**Files:**
- Create: `src/app/dashboard/profile/services-manager.tsx`
- Modify: `src/app/dashboard/profile/page.tsx`

**Interfaces:**
- Consumes: `createService`, `updateService`, `toggleServiceActive` (Task 2); `CATEGORY_LABELS`, `CATEGORY_KEYS` from `@/lib/categories`; `ServiceCategory` from `@/types/index`.
- Produces: `ServicesManager` client component with props `{ services: ManagedService[] }` where `ManagedService = { id: string; title: string; description: string; price: number; category: ServiceCategory; isActive: boolean }`.

No component-test infrastructure exists for React components in this repo (only pure-function tests) — this task is verified by typecheck, the full test suite, and manual verification in Task 6.

- [ ] **Step 1: Create the ServicesManager component**

Create `src/app/dashboard/profile/services-manager.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createService, updateService, toggleServiceActive } from '@/actions/services'
import { CATEGORY_LABELS, CATEGORY_KEYS } from '@/lib/categories'
import type { ServiceCategory } from '@/types/index'

const inputClass =
  'w-full border border-outline rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface-container-lowest transition-colors'

export type ManagedService = {
  id: string
  title: string
  description: string
  price: number
  category: ServiceCategory
  isActive: boolean
}

type FormState = {
  title: string
  description: string
  price: string
  category: ServiceCategory
}

const EMPTY_FORM: FormState = { title: '', description: '', price: '', category: 'PLUMBING' }

export function ServicesManager({ services }: { services: ManagedService[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMessage(null)
  }

  function startEdit(service: ManagedService) {
    setEditingId(service.id)
    setForm({
      title: service.title,
      description: service.description,
      price: String(service.price),
      category: service.category,
    })
    setShowForm(true)
    setMessage(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    const payload = {
      title: form.title,
      description: form.description,
      price: Number(form.price),
      category: form.category,
    }
    const result = editingId
      ? await updateService({ id: editingId, ...payload })
      : await createService(payload)
    setPending(false)
    if (result.success) {
      setMessage(editingId ? 'Servicio actualizado' : 'Servicio creado')
      closeForm()
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  async function handleToggle(service: ManagedService) {
    setPending(true)
    setMessage(null)
    const result = await toggleServiceActive({ id: service.id, isActive: !service.isActive })
    setPending(false)
    if (result.success) {
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }
  }

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-headline-md text-on-surface">Mis servicios</h2>
          <p className="text-body-md text-on-surface-variant mt-1">
            Los servicios activos se muestran en tu perfil público como catálogo.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="btn-press shrink-0 flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-full text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nuevo servicio
          </button>
        )}
      </div>

      {services.length === 0 && !showForm && (
        <p className="text-body-md text-on-surface-variant">
          Aún no has agregado servicios. Agrega los servicios que ofreces con su precio
          para que los clientes los vean en tu perfil.
        </p>
      )}

      {services.length > 0 && (
        <ul className="divide-y divide-outline-variant">
          {services.map((service) => (
            <li
              key={service.id}
              className={`py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4 ${
                service.isActive ? '' : 'opacity-50'
              }`}
            >
              <div className="min-w-0">
                <p className="text-label-md text-on-surface">
                  {service.title}
                  {!service.isActive && (
                    <span className="ml-2 text-label-sm text-on-surface-variant">(inactivo)</span>
                  )}
                </p>
                <p className="text-body-md text-on-surface-variant line-clamp-2 mt-0.5">
                  {service.description}
                </p>
                <p className="text-label-sm text-on-surface-variant mt-1">
                  {CATEGORY_LABELS[service.category]}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-label-md text-on-surface">${service.price.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => startEdit(service)}
                  disabled={pending}
                  aria-label={`Editar ${service.title}`}
                  className="btn-press p-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(service)}
                  disabled={pending}
                  aria-label={service.isActive ? `Desactivar ${service.title}` : `Activar ${service.title}`}
                  className="btn-press p-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {service.isActive ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="border-t border-outline-variant pt-5 flex flex-col gap-4">
          <h3 className="text-label-md text-on-surface">
            {editingId ? 'Editar servicio' : 'Nuevo servicio'}
          </h3>

          <div>
            <label htmlFor="service-title" className="text-label-md text-on-surface-variant block mb-1">
              Título
            </label>
            <input
              id="service-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Reparación de fugas"
              required
              minLength={5}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="service-description" className="text-label-md text-on-surface-variant block mb-1">
              Descripción
            </label>
            <textarea
              id="service-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe qué incluye el servicio, materiales, tiempos…"
              required
              minLength={20}
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="service-price" className="text-label-md text-on-surface-variant block mb-1">
                Precio (USD)
              </label>
              <input
                id="service-price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="25.00"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="service-category" className="text-label-md text-on-surface-variant block mb-1">
                Categoría
              </label>
              <select
                id="service-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}
                className={inputClass}
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="btn-press bg-primary text-on-primary px-6 py-3 rounded-full text-label-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear servicio'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={pending}
              className="btn-press px-6 py-3 rounded-full text-label-md text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {message && <p className="text-label-md text-on-surface-variant">{message}</p>}
    </section>
  )
}
```

Note on `e.target.value as ServiceCategory`: the `<option>` values are generated exclusively from `CATEGORY_KEYS`, so the assertion is safe; the server action re-validates with Zod anyway.

- [ ] **Step 2: Wire it into the profile page**

In `src/app/dashboard/profile/page.tsx`:

Add the import:

```ts
import { ServicesManager } from './services-manager'
import type { ServiceCategory } from '@/types/index'
```

Extend the provider profile select with the services relation (inside the existing `select: { ... }`):

```ts
            services: {
              select: {
                id: true, title: true, description: true,
                price: true, category: true, isActive: true,
              },
              orderBy: { createdAt: 'desc' },
            },
```

Render the manager after the `PayoutForm` block, converting `Decimal` price to `number`:

```tsx
      {profile && (
        <ServicesManager
          services={profile.services.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            price: Number(s.price),
            category: s.category as ServiceCategory,
            isActive: s.isActive,
          }))}
        />
      )}
```

(The `as ServiceCategory` assertion mirrors the existing pattern in `dashboard/applications/page.tsx:65` — Prisma's generated enum and the app-level union are structurally identical.)

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/profile/services-manager.tsx src/app/dashboard/profile/page.tsx
git commit -m "feat(profile): manage offered services from the profile page"
```

---

### Task 4: Navigation — username button → profile, "Mi perfil" tab

**Files:**
- Modify: `src/components/features/site-header.tsx:15-16`
- Modify: `src/app/dashboard/layout.tsx:15-33`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports change — behavior only.

- [ ] **Step 1: Point the header username button at the profile**

In `src/components/features/site-header.tsx`, replace:

```ts
  const dashboardHref =
    session?.user.role === 'PROVIDER' ? '/dashboard/applications' : '/dashboard/jobs'
```

with:

```ts
  const dashboardHref = '/dashboard/profile'
```

- [ ] **Step 2: Add the "Mi perfil" tab to the dashboard nav**

In `src/app/dashboard/layout.tsx`, inside `<div className="flex items-center gap-1">`, add a first tab visible to every authenticated role, before the CLIENT/PROVIDER tabs:

```tsx
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-1.5 px-3 py-4 text-label-md text-on-surface-variant hover:text-on-surface transition-colors border-b-2 border-transparent hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
              Mi perfil
            </Link>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/site-header.tsx src/app/dashboard/layout.tsx
git commit -m "feat(nav): username button opens profile; add Mi perfil tab to dashboard nav"
```

---

### Task 5: Remove the unused POST /api/services handler

**Files:**
- Modify: `src/app/api/services/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/services` unchanged; `POST` removed (no consumers — verified by `grep -rn "api/services" src/` matching only `src/proxy.ts`'s route matcher, which stays as-is).

- [ ] **Step 1: Delete the POST handler and now-unused imports**

Replace the entire content of `src/app/api/services/route.ts` with:

```ts
// src/app/api/services/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const services = await db.service.findMany({
    where: { isActive: true },
    include: { provider: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(services)
}
```

- [ ] **Step 2: Verify nothing referenced the POST handler**

Run: `grep -rn "api/services" src/ --include="*.ts*" | grep -v "app/api/services"`
Expected: only the `src/proxy.ts` matcher line.

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/services/route.ts
git commit -m "refactor(api): drop unused POST /api/services in favor of server actions"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Manual flow (dev server + seeded provider account)**

Run: `npm run dev`

1. Log in as a PROVIDER (from `prisma/seed.ts` credentials).
2. Click the username button in the home header → lands on `/dashboard/profile`.
3. Dashboard nav shows "Mi perfil" and "Mis propuestas".
4. In "Mis servicios": create a service (title, description, price, category) → appears in the list.
5. Edit it → changes persist. Deactivate it → it renders dimmed with "(inactivo)".
6. Open `/providers/<slug>` (link shown on the profile page) → only ACTIVE services appear; the deactivated one is hidden.
7. Reactivate it → it reappears on the public profile.
8. Log in as a CLIENT → profile page shows no services section; header username button also lands on `/dashboard/profile`.
9. Open `/dashboard/applications` as the provider → proposals list with estado (En revisión / Aceptada / Rechazada) — unchanged, still reachable from the "Mis propuestas" tab.

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
git status
```

Expected: clean tree (all work committed in Tasks 1–5).
