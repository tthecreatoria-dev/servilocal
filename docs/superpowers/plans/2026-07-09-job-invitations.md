# Job Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El botón "Contratar" en el perfil público de un trabajador crea un JobPost dirigido a ese trabajador (invitación), visible solo para él en un nuevo tab "Invitaciones" del dashboard, desde donde aplica con el flujo existente.

**Architecture:** Un campo nuevo `invitedProviderId` en `JobPost` (null = post público). El feed público filtra los posts invitados; las actions nuevas `declineInvitation` / `openJobToPublic` limpian el campo para devolver el post al feed. El flujo de pago/escrow no se toca.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma 7 + PostgreSQL, Zod 4, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-09-job-invitations-design.md`

## Global Constraints

- TypeScript strict: no `any`, no `@ts-ignore`, no type assertions sin comentario que lo justifique.
- Zod en todo input externo. Errores tipados como strings conocidos vía `ActionResult` (`src/types/index.ts`); nunca fallos silenciosos.
- Named exports only. (Excepción existente: las páginas de Next.js usan `export default` porque el framework lo exige.)
- Server actions para mutaciones; nada de lógica de pago en componentes React. Ninguna tarea de este plan toca estados de `JobPayment`, `Transaction` ni `Commission`.
- Multi-step writes dentro de `db.$transaction()`.
- Tests con Vitest: `npm test` (o `npx vitest run <archivo>` para uno solo). Los mocks de `@/lib/auth` y `@/lib/db` siguen el patrón `vi.hoisted` de `src/actions/__tests__/jobs.test.ts`.
- Textos de UI en español, estilo Material (clases `text-label-md`, `bg-surface-container-lowest`, iconos `material-symbols-outlined`) — copiar patrones de las páginas vecinas.

---

### Task 1: Campo `invitedProviderId` en el schema de Prisma

**Files:**
- Modify: `prisma/schema.prisma` (modelos `JobPost` y `User`)

**Interfaces:**
- Consumes: nada.
- Produces: columna `JobPost.invitedProviderId: String | null`, relación `JobPost.invitedProvider → User?`, relación inversa `User.invitations: JobPost[]`. El cliente Prisma regenerado expone `invitedProviderId` en todos los reads/writes de `jobPost`. Todas las tareas siguientes dependen de esto.

- [ ] **Step 1: Agregar el campo y la relación al modelo `JobPost`**

En `prisma/schema.prisma`, dentro de `model JobPost`, después de `clientId`/`client` y antes de `applications`, agregar:

```prisma
  invitedProviderId String?
  invitedProvider   User?            @relation("ProviderInvitations", fields: [invitedProviderId], references: [id])
```

Y al bloque de índices del mismo modelo (junto a los `@@index` existentes):

```prisma
  @@index([invitedProviderId])
```

- [ ] **Step 2: Agregar la relación inversa al modelo `User`**

Dentro de `model User`, junto a las relaciones existentes (`applications`, `payouts`, …):

```prisma
  invitations     JobPost[]        @relation("ProviderInvitations")
```

- [ ] **Step 3: Crear la migración y regenerar el cliente**

Run: `npx prisma migrate dev --name job_invitations`
Expected: crea `prisma/migrations/<timestamp>_job_invitations/migration.sql` con `ALTER TABLE "JobPost" ADD COLUMN "invitedProviderId" TEXT`, el índice y la foreign key; corre `prisma generate` sin errores.

- [ ] **Step 4: Verificar que el proyecto sigue compilando**

Run: `npx tsc --noEmit`
Expected: sin errores (el campo es opcional, nada existente se rompe).

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(db): add invitedProviderId to JobPost for hire invitations"
```

---

### Task 2: `CreateJobPostSchema` + `createJobPost` aceptan un invitado

**Files:**
- Modify: `src/types/schemas.ts` (CreateJobPostSchema)
- Modify: `src/actions/jobs.ts:22-48` (createJobPost)
- Test: `src/actions/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: columna `invitedProviderId` de Task 1.
- Produces: `CreateJobPostSchema` acepta `invitedProviderId?: string` (cuid); `createJobPost` retorna `{ success: false, error: 'invalid_invitee' }` si el invitado no existe o no es PROVIDER, y guarda `invitedProviderId` (o `null`) en el create. Task 8 (formulario) envía este campo.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/actions/__tests__/jobs.test.ts`:

1. Agregar el mock de `user.findUnique`. Junto a los otros `vi.hoisted` (línea ~8):

```ts
const mockUserFindUnique = vi.hoisted(() => vi.fn())
```

En el `vi.mock('@/lib/db', ...)` agregar al objeto `db`:

```ts
    user: {
      findUnique: mockUserFindUnique,
    },
```

En el `beforeEach` agregar:

```ts
  mockUserFindUnique.mockClear()
```

2. **Actualizar las dos aserciones existentes de éxito** de `createJobPost` (`'creates job post and returns it on success'` y `'nulls location fields for a remote job'`): en ambos `expect(mockJobPostCreate).toHaveBeenCalledWith({ data: { ... } })` agregar la línea:

```ts
        invitedProviderId: null,
```

3. Agregar al final del `describe('createJobPost()')`:

```ts
  it('saves invitedProviderId when inviting a valid provider', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockUserFindUnique.mockResolvedValueOnce({ role: 'PROVIDER' })
    const created = { id: 'job-3', status: 'PENDING_PAYMENT', clientId: 'client-1' }
    mockJobPostCreate.mockResolvedValueOnce(created)

    const result = await createJobPost({
      ...validJobPostData,
      invitedProviderId: 'clprv0000000000000000000000',
    })

    expect(result).toEqual({ success: true, data: created })
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'clprv0000000000000000000000' },
      select: { role: true },
    })
    expect(mockJobPostCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ invitedProviderId: 'clprv0000000000000000000000' }),
    })
  })

  it('returns invalid_invitee when the invited user does not exist', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockUserFindUnique.mockResolvedValueOnce(null)

    const result = await createJobPost({
      ...validJobPostData,
      invitedProviderId: 'clprv0000000000000000000000',
    })

    expect(result).toEqual({ success: false, error: 'invalid_invitee' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('returns invalid_invitee when the invited user is not a PROVIDER', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockUserFindUnique.mockResolvedValueOnce({ role: 'CLIENT' })

    const result = await createJobPost({
      ...validJobPostData,
      invitedProviderId: 'clprv0000000000000000000000',
    })

    expect(result).toEqual({ success: false, error: 'invalid_invitee' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('returns validation error when invitedProviderId is not a cuid', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const result = await createJobPost({ ...validJobPostData, invitedProviderId: 'not-a-cuid' })
    expect(result).toEqual({ success: false, error: 'validation' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — los 4 tests nuevos fallan (el schema rechaza la key desconocida o `mockUserFindUnique` nunca se llama) y los 2 existentes fallan por el `invitedProviderId: null` que aún no se envía.

- [ ] **Step 3: Implementar schema y action**

En `src/types/schemas.ts`, dentro del `z.object({...})` de `CreateJobPostSchema`, después de `longitude`:

```ts
    invitedProviderId: z.string().cuid('Invalid provider ID').optional(),
```

En `src/actions/jobs.ts`, reemplazar el cuerpo de `createJobPost` después del `safeParse` por:

```ts
  const parsed = CreateJobPostSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  if (parsed.data.invitedProviderId) {
    const invitee = await db.user.findUnique({
      where: { id: parsed.data.invitedProviderId },
      select: { role: true },
    })
    if (!invitee || invitee.role !== 'PROVIDER') {
      return { success: false, error: 'invalid_invitee' }
    }
  }

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
      invitedProviderId: parsed.data.invitedProviderId ?? null,
    },
  })

  return { success: true, data: jobPost }
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): createJobPost accepts an invited provider"
```

---

### Task 3: Guard `not_invited` en `createJobApplication`

**Files:**
- Modify: `src/actions/jobs.ts:50-95` (createJobApplication)
- Test: `src/actions/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: `jobPost.invitedProviderId` (Task 1).
- Produces: `createJobApplication` retorna `{ success: false, error: 'not_invited' }` cuando el post tiene invitado y el caller no lo es. Posts sin invitación se comportan exactamente igual que antes.

- [ ] **Step 1: Escribir los tests que fallan**

Al final del `describe('createJobApplication()')` en `src/actions/__tests__/jobs.test.ts`:

```ts
  it('returns not_invited when the post is invitation-only for another provider', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const txCreate = vi.fn()
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({
        jobPost: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: validApplicationData.jobPostId,
            status: 'OPEN',
            invitedProviderId: 'someone-else',
          }),
        },
        jobApplication: { findUnique: vi.fn(), create: txCreate },
      })
    )
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'not_invited' })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('lets the invited provider apply to an invitation-only post', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const created = { id: 'app-2', ...validApplicationData, providerId: 'provider-1', status: 'PENDING' }
    const txCreate = vi.fn().mockResolvedValueOnce(created)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({
        jobPost: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: validApplicationData.jobPostId,
            status: 'OPEN',
            invitedProviderId: 'provider-1',
          }),
        },
        jobApplication: { findUnique: vi.fn().mockResolvedValueOnce(null), create: txCreate },
      })
    )
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: true, data: created })
  })
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts -t 'not_invited'`
Expected: FAIL — el primer test recibe `{ success: true, ... }` en lugar de `not_invited` (el guard no existe; nota: el segundo test, `lets the invited provider apply`, ya pasa — es un test de regresión para el guard que se va a agregar).

- [ ] **Step 3: Implementar el guard**

En `createJobApplication` (`src/actions/jobs.ts`), dentro de la `$transaction`, inmediatamente después de `if (jobPost.status !== 'OPEN') throw new Error('post_not_open')`:

```ts
      if (jobPost.invitedProviderId && jobPost.invitedProviderId !== session.user.id) {
        throw new Error('not_invited')
      }
```

Y en el `catch`, agregar `'not_invited'` al array `known`:

```ts
      const known = ['post_not_found', 'post_not_open', 'not_invited', 'already_applied']
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): only the invited provider may apply to invitation posts"
```

---

### Task 4: Action `declineInvitation`

**Files:**
- Modify: `src/types/schemas.ts` (schema + type nuevos)
- Modify: `src/actions/jobs.ts` (action nueva al final)
- Test: `src/actions/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: `jobPost.invitedProviderId`, patrón `$transaction` + errores tipados.
- Produces: `declineInvitation(data: DeclineInvitationInput): Promise<ActionResult<JobPost>>` con `DeclineInvitationInput = { jobPostId: string }`. Errores: `unauthorized`, `forbidden`, `validation`, `post_not_found`, `not_invited`, `post_not_open`, `already_applied`. Task 10 (botón Rechazar) la llama.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/actions/__tests__/jobs.test.ts`, agregar `declineInvitation` al import de `@/actions/jobs` y agregar el describe:

```ts
describe('declineInvitation()', () => {
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(post: Record<string, unknown> | null, existingApp: unknown = null) {
    return {
      jobPost: {
        findUnique: vi.fn().mockResolvedValue(post),
        update: vi.fn().mockResolvedValue({ id: JOB_ID, invitedProviderId: null }),
      },
      jobApplication: { findUnique: vi.fn().mockResolvedValue(existingApp) },
    }
  }

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValueOnce(null)
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-provider roles', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid ids', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    expect(await declineInvitation({ jobPostId: 'nope' })).toEqual({ success: false, error: 'validation' })
  })

  it('returns post_not_found when the post does not exist', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(makeTx(null)))
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_found' })
  })

  it('returns not_invited when the caller is not the invited provider', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, status: 'OPEN', invitedProviderId: 'someone-else' }))
    )
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'not_invited' })
  })

  it('returns not_invited when the post has no invitation', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, status: 'OPEN', invitedProviderId: null }))
    )
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'not_invited' })
  })

  it('returns post_not_open when the post is not OPEN', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, status: 'ASSIGNED', invitedProviderId: 'provider-1' }))
    )
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_open' })
  })

  it('returns already_applied when the provider already applied', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, status: 'OPEN', invitedProviderId: 'provider-1' }, { id: 'app-1' }))
    )
    expect(await declineInvitation({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'already_applied' })
  })

  it('clears invitedProviderId so the post becomes public', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const tx = makeTx({ id: JOB_ID, status: 'OPEN', invitedProviderId: 'provider-1' })
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(tx))

    const result = await declineInvitation({ jobPostId: JOB_ID })

    expect(result.success).toBe(true)
    expect(tx.jobPost.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { invitedProviderId: null },
    })
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — el import de `declineInvitation` no existe.

- [ ] **Step 3: Implementar schema y action**

En `src/types/schemas.ts`, junto a `StartJobSchema`:

```ts
export const DeclineInvitationSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
})
```

Y junto a los type exports existentes:

```ts
export type DeclineInvitationInput = z.infer<typeof DeclineInvitationSchema>
```

En `src/actions/jobs.ts`: agregar `DeclineInvitationSchema` y `DeclineInvitationInput` a los imports desde `@/types/schemas`, y al final del archivo:

```ts
export async function declineInvitation(
  data: DeclineInvitationInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.update>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = DeclineInvitationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    const updated = await db.$transaction(async (tx) => {
      const post = await tx.jobPost.findUnique({ where: { id: parsed.data.jobPostId } })
      if (!post) throw new Error('post_not_found')
      if (post.invitedProviderId !== session.user.id) throw new Error('not_invited')
      if (post.status !== 'OPEN') throw new Error('post_not_open')

      const existing = await tx.jobApplication.findUnique({
        where: {
          jobPostId_providerId: { jobPostId: post.id, providerId: session.user.id },
        },
      })
      if (existing) throw new Error('already_applied')

      return tx.jobPost.update({
        where: { id: post.id },
        data: { invitedProviderId: null },
      })
    })
    return { success: true, data: updated }
  } catch (error) {
    if (error instanceof Error) {
      const known = ['post_not_found', 'not_invited', 'post_not_open', 'already_applied']
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): provider can decline a hire invitation"
```

---

### Task 5: Action `openJobToPublic`

**Files:**
- Modify: `src/types/schemas.ts` (schema + type nuevos)
- Modify: `src/actions/jobs.ts` (action nueva al final)
- Test: `src/actions/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: `jobPost.invitedProviderId`.
- Produces: `openJobToPublic(data: OpenJobToPublicInput): Promise<ActionResult<JobPost>>` con `OpenJobToPublicInput = { jobPostId: string }`. Errores: `unauthorized`, `forbidden`, `validation`, `post_not_found`, `post_not_owned`, `post_not_open`, `no_invitation`. (Nota: el spec listaba `forbidden` para el no-dueño; se usa `post_not_owned` por consistencia con `selectJobApplication`.) Task 11 (botón del cliente) la llama.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar `openJobToPublic` al import y el describe:

```ts
describe('openJobToPublic()', () => {
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(post: Record<string, unknown> | null) {
    return {
      jobPost: {
        findUnique: vi.fn().mockResolvedValue(post),
        update: vi.fn().mockResolvedValue({ id: JOB_ID, invitedProviderId: null }),
      },
    }
  }

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValueOnce(null)
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-client roles', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid ids', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    expect(await openJobToPublic({ jobPostId: 'nope' })).toEqual({ success: false, error: 'validation' })
  })

  it('returns post_not_found when the post does not exist', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(makeTx(null)))
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_found' })
  })

  it('returns post_not_owned when the post belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, clientId: 'other-client', status: 'OPEN', invitedProviderId: 'prov-1' }))
    )
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_owned' })
  })

  it('returns post_not_open when the post is not OPEN', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, clientId: 'client-1', status: 'ASSIGNED', invitedProviderId: 'prov-1' }))
    )
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_open' })
  })

  it('returns no_invitation when the post is already public', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx({ id: JOB_ID, clientId: 'client-1', status: 'OPEN', invitedProviderId: null }))
    )
    expect(await openJobToPublic({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'no_invitation' })
  })

  it('clears invitedProviderId so the post becomes public', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const tx = makeTx({ id: JOB_ID, clientId: 'client-1', status: 'OPEN', invitedProviderId: 'prov-1' })
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(tx))

    const result = await openJobToPublic({ jobPostId: JOB_ID })

    expect(result.success).toBe(true)
    expect(tx.jobPost.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { invitedProviderId: null },
    })
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: FAIL — el import de `openJobToPublic` no existe.

- [ ] **Step 3: Implementar schema y action**

En `src/types/schemas.ts`:

```ts
export const OpenJobToPublicSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
})
```

```ts
export type OpenJobToPublicInput = z.infer<typeof OpenJobToPublicSchema>
```

En `src/actions/jobs.ts` (agregar imports correspondientes) al final del archivo:

```ts
export async function openJobToPublic(
  data: OpenJobToPublicInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.update>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'CLIENT') return { success: false, error: 'forbidden' }

  const parsed = OpenJobToPublicSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    const updated = await db.$transaction(async (tx) => {
      const post = await tx.jobPost.findUnique({ where: { id: parsed.data.jobPostId } })
      if (!post) throw new Error('post_not_found')
      if (post.clientId !== session.user.id) throw new Error('post_not_owned')
      if (post.status !== 'OPEN') throw new Error('post_not_open')
      if (!post.invitedProviderId) throw new Error('no_invitation')

      return tx.jobPost.update({
        where: { id: post.id },
        data: { invitedProviderId: null },
      })
    })
    return { success: true, data: updated }
  } catch (error) {
    if (error instanceof Error) {
      const known = ['post_not_found', 'post_not_owned', 'post_not_open', 'no_invitation']
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/actions/__tests__/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas.ts src/actions/jobs.ts src/actions/__tests__/jobs.test.ts
git commit -m "feat(jobs): client can open an invitation post to the public"
```

---

### Task 6: Filtrar posts invitados del feed público y la home

**Files:**
- Modify: `src/app/(marketplace)/jobs/page.tsx:19-34` (query del feed)
- Modify: `src/app/page.tsx` (`getActiveCategories` y `getActiveJobPosts`)

**Interfaces:**
- Consumes: columna `invitedProviderId`.
- Produces: ningún post con invitación activa aparece en `/jobs` ni en la home. (No hay infraestructura de tests para páginas server-component en el repo; la verificación es el typecheck aquí y la verificación e2e de la Task 12.)

- [ ] **Step 1: Filtrar el feed `/jobs`**

En `src/app/(marketplace)/jobs/page.tsx`, en el `where` del `db.jobPost.findMany`, después de `status: 'OPEN',`:

```ts
      invitedProviderId: null,
```

- [ ] **Step 2: Filtrar las dos queries de la home**

En `src/app/page.tsx`, en `getActiveCategories`:

```ts
      where: { status: 'OPEN', invitedProviderId: null },
```

y en `getActiveJobPosts`:

```ts
      where: { status: 'OPEN', invitedProviderId: null },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketplace)/jobs/page.tsx" src/app/page.tsx
git commit -m "feat(jobs): hide invitation-only posts from public feed and home"
```

---

### Task 7: El botón "Contratar" pasa el slug del invitado

**Files:**
- Modify: `src/app/(marketplace)/providers/[slug]/page.tsx:55-57` (hireHref)

**Interfaces:**
- Consumes: `profile.slug` de `getPublicProviderProfile`.
- Produces: URL `/dashboard/jobs/new?invite=<slug>&category=<skill>` que Task 8 interpreta.

- [ ] **Step 1: Cambiar `hireHref`**

Reemplazar:

```ts
  const hireHref = profile.skills[0]
    ? `/dashboard/jobs/new?category=${profile.skills[0]}`
    : '/dashboard/jobs/new'
```

por:

```ts
  const hireHref = profile.skills[0]
    ? `/dashboard/jobs/new?invite=${profile.slug}&category=${profile.skills[0]}`
    : `/dashboard/jobs/new?invite=${profile.slug}`
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketplace)/providers/[slug]/page.tsx"
git commit -m "feat(providers): hire button targets the provider via invite param"
```

---

### Task 8: Formulario de nuevo proyecto con banner de invitación

**Files:**
- Modify: `src/app/dashboard/jobs/new/page.tsx`
- Modify: `src/app/dashboard/jobs/new/new-job-form.tsx`

**Interfaces:**
- Consumes: query param `invite=<slug>` (Task 7); `createJobPost` con `invitedProviderId` (Task 2).
- Produces: el post creado desde un perfil lleva `invitedProviderId`. Un slug inválido degrada a post público sin error.

- [ ] **Step 1: Resolver el slug en la página**

Reemplazar `src/app/dashboard/jobs/new/page.tsx` por:

```tsx
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseCategoryParam } from '@/lib/categories'
import { NewJobForm } from './new-job-form'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; invite?: string }>
}) {
  const { category, invite } = await searchParams
  const initialCategory = parseCategoryParam(category)

  const session = await auth()
  if (!session) {
    const params = new URLSearchParams()
    if (initialCategory) params.set('category', initialCategory)
    if (invite) params.set('invite', invite)
    const qs = params.toString()
    const callbackUrl = qs ? `/dashboard/jobs/new?${qs}` : '/dashboard/jobs/new'
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  // Un slug inválido degrada a post público sin invitación — no es un error.
  let invitedProvider: { id: string; name: string } | null = null
  if (invite) {
    const profile = await db.providerProfile.findUnique({
      where: { slug: invite },
      select: { userId: true, user: { select: { name: true } } },
    })
    if (profile) invitedProvider = { id: profile.userId, name: profile.user.name }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Mis proyectos
      </Link>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-headline-lg-mobile text-primary">
            {invitedProvider ? `Contratar a ${invitedProvider.name}` : 'Publicar proyecto'}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {invitedProvider
              ? 'Describe el trabajo que necesitas. Solo esta persona verá tu proyecto y podrá enviarte su propuesta.'
              : 'Describe lo que necesitas y recibe propuestas de proveedores locales.'}
          </p>
        </div>
        {invitedProvider && (
          <div className="flex items-start gap-3 bg-primary-container border border-primary/30 rounded-xl px-4 py-3 mb-7">
            <span
              className="material-symbols-outlined text-on-primary-container text-[20px] mt-0.5 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              mail
            </span>
            <p className="text-on-primary-container text-label-md">
              Estás invitando a <strong>{invitedProvider.name}</strong>. El proyecto no aparecerá
              en el listado público mientras la invitación esté activa.
            </p>
          </div>
        )}
        <NewJobForm initialCategory={initialCategory} invitedProviderId={invitedProvider?.id ?? null} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Pasar el invitado por el formulario**

En `src/app/dashboard/jobs/new/new-job-form.tsx`:

1. Firma del componente:

```tsx
export function NewJobForm({
  initialCategory,
  invitedProviderId = null,
}: {
  initialCategory?: ServiceCategory | null
  invitedProviderId?: string | null
}) {
```

2. En la llamada a `createJobPost`, después de `longitude: ...`:

```ts
      invitedProviderId: invitedProviderId ?? undefined,
```

3. En `ERROR_LABELS`, agregar:

```ts
  invalid_invitee: 'El trabajador que intentas invitar ya no está disponible.',
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/jobs/new/
git commit -m "feat(jobs): new-job form creates an invitation when hiring from a profile"
```

---

### Task 9: Estado `provider-not-invited` en el detalle público del proyecto

**Files:**
- Modify: `src/app/(marketplace)/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: `job.invitedProviderId` (scalar, ya viene en el `findUnique` existente).
- Produces: un PROVIDER que no es el invitado ve "Este proyecto es por invitación" sin formulario; el invitado ve el flujo de aplicar normal aunque la categoría no esté en sus skills (el cliente lo eligió explícitamente).

- [ ] **Step 1: Agregar el estado a la máquina de acción**

En `src/app/(marketplace)/jobs/[id]/page.tsx`, agregar `'provider-not-invited'` al union type `ActionState`:

```ts
  type ActionState =
    | 'unauthenticated'
    | 'owner'
    | 'client-not-owner'
    | 'provider-not-invited'
    | 'provider-wrong-category'
    | 'provider-already-applied'
    | 'job-closed'
    | 'can-apply'
```

Y reemplazar la rama PROVIDER del cálculo por:

```ts
  } else {
    // PROVIDER — check existing application first so status is always visible
    const isInvitee = job.invitedProviderId === session.user.id
    if (existingApplication) {
      actionState = 'provider-already-applied'
    } else if (job.status !== 'OPEN') {
      actionState = 'job-closed'
    } else if (job.invitedProviderId && !isInvitee) {
      actionState = 'provider-not-invited'
    } else if (!isInvitee && providerProfile && !providerProfile.skills.includes(job.category)) {
      // El invitado puede aplicar aunque la categoría no esté en sus skills:
      // el cliente lo eligió explícitamente.
      actionState = 'provider-wrong-category'
    } else {
      actionState = 'can-apply'
    }
  }
```

- [ ] **Step 2: Agregar el bloque de UI**

Junto a los otros bloques de estado (después del de `provider-wrong-category`):

```tsx
      {actionState === 'provider-not-invited' && (
        <div className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-5">
          <span className="material-symbols-outlined text-on-surface-variant text-[24px] mt-0.5 shrink-0">
            mail_lock
          </span>
          <p className="text-body-md text-on-surface-variant">
            Este proyecto es por invitación. El cliente eligió a un proveedor específico
            para este trabajo.
          </p>
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketplace)/jobs/[id]/page.tsx"
git commit -m "feat(jobs): invitation-only posts hide the apply form from other providers"
```

---

### Task 10: Página `/dashboard/invitations` + tab en la nav

**Files:**
- Create: `src/app/dashboard/invitations/page.tsx`
- Create: `src/app/dashboard/invitations/decline-invitation-button.tsx`
- Modify: `src/app/dashboard/layout.tsx:32-40` (nav)

**Interfaces:**
- Consumes: `declineInvitation` (Task 4); query con `invitedProviderId` + `applications: { none: ... }`.
- Produces: el trabajador ve y gestiona sus invitaciones pendientes.

- [ ] **Step 1: Crear el botón de rechazo (client component)**

`src/app/dashboard/invitations/decline-invitation-button.tsx` (mismo patrón que `complete-job-button.tsx`):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { declineInvitation } from '@/actions/jobs'

const ERROR_LABELS: Record<string, string> = {
  not_invited:     'Esta invitación ya no está dirigida a ti.',
  post_not_open:   'Este proyecto ya no está abierto.',
  already_applied: 'Ya enviaste una propuesta a este proyecto.',
  post_not_found:  'El proyecto ya no existe.',
}

export function DeclineInvitationButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDecline() {
    if (!confirm('¿Rechazar esta invitación? El proyecto pasará al listado público y otros proveedores podrán aplicar.')) return
    setPending(true)
    const result = await declineInvitation({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(ERROR_LABELS[result.error] ?? `Error: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleDecline}
      disabled={pending}
      className="btn-press border border-outline-variant bg-surface-container-lowest text-on-surface-variant px-4 py-2 rounded-full text-label-sm hover:bg-surface-container transition-colors disabled:opacity-50"
    >
      {pending ? 'Rechazando…' : 'Rechazar'}
    </button>
  )
}
```

- [ ] **Step 2: Crear la página de invitaciones**

`src/app/dashboard/invitations/page.tsx` (patrón visual de `dashboard/applications/page.tsx`):

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import type { ServiceCategory } from '@/types/index'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/lib/categories'
import { DeclineInvitationButton } from './decline-invitation-button'

export default async function ProviderInvitationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'PROVIDER') redirect('/dashboard')

  const invitations = await db.jobPost.findMany({
    where: {
      invitedProviderId: session.user.id,
      status: 'OPEN',
      applications: { none: { providerId: session.user.id } },
    },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-headline-lg-mobile text-primary">Invitaciones</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Clientes que te eligieron directamente para su proyecto.
        </p>
      </div>

      {invitations.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <span className="material-symbols-outlined text-5xl text-outline">mail</span>
          <p className="text-headline-md text-on-surface-variant">No tienes invitaciones pendientes</p>
          <p className="text-body-md text-on-surface-variant max-w-sm">
            Cuando un cliente te contrate desde tu perfil, su invitación aparecerá aquí.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {invitations.map((job) => {
            const cat = job.category as ServiceCategory
            return (
              <li
                key={job.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-surface-container px-3 py-1 rounded-full text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">{CATEGORY_ICONS[cat]}</span>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">
                    {new Date(job.deadline).toLocaleDateString('es-SV')}
                  </span>
                </div>

                <h2 className="text-label-md text-on-surface mb-1">{job.title}</h2>
                <p className="text-body-md text-on-surface-variant line-clamp-2 mb-4">{job.description}</p>

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
                  <div>
                    <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      {job.client.name}
                    </p>
                    <p className="text-label-md text-primary font-bold mt-0.5">
                      ${Number(job.budget).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DeclineInvitationButton jobPostId={job.id} />
                    <Link
                      href={`/jobs/${job.id}`}
                      className="btn-press bg-primary text-on-primary px-4 py-2 rounded-full text-label-sm hover:opacity-90 transition-opacity"
                    >
                      Ver y aplicar
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Agregar el tab a la nav del dashboard**

En `src/app/dashboard/layout.tsx`, reemplazar el bloque `{role === 'PROVIDER' && (...)}` por un fragment con los dos enlaces:

```tsx
            {role === 'PROVIDER' && (
              <>
                <Link
                  href="/dashboard/invitations"
                  className="flex items-center gap-1.5 px-3 py-4 text-label-md text-on-surface-variant hover:text-on-surface transition-colors border-b-2 border-transparent hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">mail</span>
                  Invitaciones
                </Link>
                <Link
                  href="/dashboard/applications"
                  className="flex items-center gap-1.5 px-3 py-4 text-label-md text-on-surface-variant hover:text-on-surface transition-colors border-b-2 border-transparent hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  Mis propuestas
                </Link>
              </>
            )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/invitations/ src/app/dashboard/layout.tsx
git commit -m "feat(dashboard): provider invitations tab with decline action"
```

---

### Task 11: Vista del cliente — "Invitaste a X" + Abrir al público

**Files:**
- Create: `src/app/dashboard/jobs/[id]/open-to-public-button.tsx`
- Modify: `src/app/dashboard/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: `openJobToPublic` (Task 5); relación `invitedProvider` (Task 1).
- Produces: el cliente ve a quién invitó y puede convertir el post en público.

- [ ] **Step 1: Crear el botón (client component)**

`src/app/dashboard/jobs/[id]/open-to-public-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { openJobToPublic } from '@/actions/jobs'

const ERROR_LABELS: Record<string, string> = {
  post_not_owned: 'Este proyecto no te pertenece.',
  post_not_open:  'El proyecto ya no está abierto.',
  no_invitation:  'Este proyecto ya es público.',
  post_not_found: 'El proyecto ya no existe.',
}

export function OpenToPublicButton({ jobPostId }: { jobPostId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleOpen() {
    if (!confirm('¿Abrir este proyecto al público? La invitación se cancela y cualquier proveedor podrá enviar propuestas.')) return
    setPending(true)
    const result = await openJobToPublic({ jobPostId })
    if (result.success) {
      router.refresh()
    } else {
      alert(ERROR_LABELS[result.error] ?? `Error: ${result.error}`)
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={pending}
      className="btn-press border border-outline-variant bg-surface-container-lowest text-on-surface px-4 py-2 rounded-full text-label-sm hover:bg-surface-container transition-colors disabled:opacity-50"
    >
      {pending ? 'Abriendo…' : 'Abrir al público'}
    </button>
  )
}
```

- [ ] **Step 2: Mostrar la invitación en la página del cliente**

En `src/app/dashboard/jobs/[id]/page.tsx`:

1. Import nuevo:

```tsx
import { OpenToPublicButton } from './open-to-public-button'
```

2. En el `include` del `db.jobPost.findUnique`, agregar:

```ts
      invitedProvider: { select: { name: true } },
```

3. Después del `<span>` del status (el bloque `{job.status}` que cierra en la línea ~43) y antes del bloque `IN_PROGRESS`, agregar:

```tsx
      {job.invitedProviderId && job.invitedProvider && job.status === 'OPEN' && (
        <div className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-zinc-600">
            Invitaste a <strong className="text-zinc-900">{job.invitedProvider.name}</strong>.
            Solo esa persona puede ver este proyecto y enviarte una propuesta.
          </p>
          <OpenToPublicButton jobPostId={job.id} />
        </div>
      )}
```

(Esta página usa clases `zinc` planas, distintas del resto — se sigue su estilo local.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/jobs/[id]/"
git commit -m "feat(dashboard): client sees the invitee and can open the job to the public"
```

---

### Task 12: Verificación final

**Files:** ninguno nuevo.

**Interfaces:** n/a — gate de calidad.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, 0 fallos.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build exitoso sin errores de tipos.

- [ ] **Step 3: Verificación e2e manual**

Usar la skill del proyecto `verify` (Playwright contra la app corriendo) para recorrer el flujo:

1. Como CLIENT: abrir `/providers/<slug>` → "Contratar con garantía" → verificar el banner "Estás invitando a…" → llenar y publicar → pagar (flujo dev) → el post queda `OPEN`.
2. Verificar que el post NO aparece en `/jobs` ni en la home.
3. Como el PROVIDER invitado: ver el tab "Invitaciones" → el post aparece → "Ver y aplicar" → enviar propuesta → la invitación desaparece del tab y aparece en "Mis propuestas".
4. Como otro PROVIDER: abrir `/jobs/<id>` por URL directa → ver "Este proyecto es por invitación" sin formulario.
5. Como CLIENT en `/dashboard/jobs/<id>`: ver "Invitaste a X" (en un post nuevo sin propuesta, probar "Abrir al público" → aparece en `/jobs`).

Expected: los 5 recorridos se comportan como se describe.

- [ ] **Step 4: Commit final si hubo ajustes**

```bash
git status
```

Si la verificación exigió correcciones, commitearlas con mensajes `fix(...)` descriptivos.
