# Invitaciones de contratación desde el perfil del trabajador

**Fecha:** 2026-07-09
**Estado:** Aprobado para implementación

## Problema

Hoy el botón "Contratar con garantía" en el perfil público de un trabajador
(`/providers/[slug]`) solo enlaza a `/dashboard/jobs/new?category=X`. El JobPost
resultante es genérico: va al feed público de `/jobs` y no tiene ninguna relación
con el trabajador cuyo perfil el cliente estaba viendo. "Contratar a X" no contrata
a X.

## Solución

Un JobPost puede nacer **dirigido a un trabajador específico** (invitación). El
trabajador invitado lo ve en un nuevo tab "Invitaciones" de su dashboard y aplica
con el flujo de aplicación existente. Mientras la invitación esté activa, el post
no aparece en el feed público.

Decisiones tomadas durante el brainstorming:

- El cliente llena el **formulario completo actual** de nuevo proyecto (título,
  descripción, presupuesto, fecha límite, ubicación) — la invitación tiene todo
  el contexto.
- El proyecto invitado es **exclusivo al invitado**: no aparece en `/jobs` ni en
  la home mientras la invitación esté activa.
- Si el trabajador no responde o rechaza: el trabajador puede **rechazar** la
  invitación y el cliente puede en cualquier momento **abrirla al público**.
  Ambas acciones convierten el post en un post público normal. No hay reembolso
  en esta fase (eso es Fase 4 del roadmap).
- El flujo de dinero **no cambia**: el cliente paga al crear el post
  (`PENDING_PAYMENT` → pago en custodia → `OPEN`), igual que hoy. La exclusividad
  aplica desde que el post se abre.

## 1. Modelo de datos

Campo nuevo opcional en `JobPost` (migración aditiva, sin backfill — los posts
existentes quedan `null` = públicos):

```prisma
model JobPost {
  // ...campos existentes...
  invitedProviderId String?
  invitedProvider   User?   @relation("ProviderInvitations", fields: [invitedProviderId], references: [id])

  @@index([invitedProviderId])
}

model User {
  // ...relaciones existentes...
  invitations JobPost[] @relation("ProviderInvitations")
}
```

Una invitación es un JobPost con `invitedProviderId` lleno. Limpiar el campo
convierte el post en público. No se conserva historial de invitaciones
rechazadas (decisión deliberada: YAGNI; si algún día se necesita multi-invitación
o historial, se migra a un modelo `JobInvitation` separado).

## 2. Crear la invitación (lado cliente)

- `/providers/[slug]`: el botón "Contratar con garantía" enlaza a
  `/dashboard/jobs/new?invite=<slug>&category=<primera skill>`.
- `jobs/new/page.tsx`: si viene `invite`, resuelve el slug a un
  `ProviderProfile`. Si existe, muestra un banner "Estás invitando a
  **{nombre}**" sobre el formulario y pasa el `userId` del provider al form
  (campo oculto). Si el slug no resuelve, se ignora y el formulario funciona
  como hoy (post público).
- `CreateJobPostSchema` (en `src/types/schemas.ts`) gana
  `invitedProviderId: z.string().cuid().optional()`.
- `createJobPost` (en `src/actions/jobs.ts`) valida server-side que el usuario
  invitado exista y tenga rol `PROVIDER`; si no, retorna
  `{ success: false, error: 'invalid_invitee' }`. Un cliente no puede
  invitarse a sí mismo (cubierto por el check de rol: el creador es CLIENT).
- El flujo de pago no se toca: `PENDING_PAYMENT` → webhook/success → `OPEN`.

## 3. Visibilidad

- Feed público `(marketplace)/jobs/page.tsx` y las **dos** queries de la home
  (`src/app/page.tsx`): agregar `invitedProviderId: null` al `where`.
- La página de detalle `(marketplace)/jobs/[id]` sigue accesible por URL — el
  invitado la necesita para aplicar. A su máquina de `ActionState` se agrega
  `provider-not-invited`: un PROVIDER que no es el invitado ve el mensaje
  "Este proyecto es por invitación" y no ve el formulario de aplicar.

## 4. Tab "Invitaciones" (lado trabajador)

- Nav del dashboard (`src/app/dashboard/layout.tsx`): nuevo enlace
  **Invitaciones** (icono `mail`), visible solo para `PROVIDER`, junto a
  "Mis propuestas".
- Nueva página `/dashboard/invitations`: lista los JobPost con
  `invitedProviderId = session.user.id` y `status: 'OPEN'`. Cada tarjeta
  muestra título, categoría, presupuesto, fecha límite y nombre del cliente,
  con dos acciones:
  - **Ver y aplicar** → enlaza a `/jobs/[id]` (flujo de aplicar existente).
  - **Rechazar** → server action `declineInvitation`.
- Si el trabajador ya aplicó, la invitación deja de listarse: la query excluye
  posts donde ya existe una aplicación suya
  (`applications: { none: { providerId: session.user.id } }`). La propuesta
  vive en "Mis propuestas" como siempre.

## 5. Aplicar, rechazar y abrir al público

Cambios en `src/actions/jobs.ts`:

- `createJobApplication` — guard nuevo dentro de la `$transaction` existente:
  si `jobPost.invitedProviderId` está lleno y no es `session.user.id`, retornar
  error `not_invited`.
- `declineInvitation(jobPostId)` — nueva action. Permisos: solo el provider
  invitado. Condiciones: post en `OPEN` y sin aplicación propia existente.
  Efecto: `invitedProviderId = null` (el post cae al feed público). Errores
  tipados: `post_not_found`, `not_invited`, `post_not_open`, `already_applied`.
- `openJobToPublic(jobPostId)` — nueva action. Permisos: solo el cliente dueño
  del post. Condiciones: post en `OPEN` con invitación activa. Efecto:
  `invitedProviderId = null`. Errores tipados: `post_not_found`, `forbidden`,
  `post_not_open`, `no_invitation`.
- `/dashboard/jobs/[id]` (vista del cliente): cuando el post tiene invitación
  activa, mostrar "Invitaste a {nombre}" y el botón **Abrir al público**.

Ninguna de estas acciones toca estados de pago, transacciones ni comisiones —
el dinero sigue en custodia exactamente igual que en un post público.

## 6. Errores

Todas las actions siguen el patrón `ActionResult` existente con errores tipados
(strings conocidos), sin fallos silenciosos. La resolución de slug inválido en
`jobs/new` degrada a post público sin invitación (no es un error de dinero).

## 7. Tests

En `src/actions/__tests__/` siguiendo el patrón existente:

- `createJobPost` con invitado válido guarda `invitedProviderId`.
- `createJobPost` con `invitedProviderId` que no existe o no es PROVIDER →
  `invalid_invitee`.
- `createJobApplication`: el invitado puede aplicar; otro provider recibe
  `not_invited`; en un post sin invitación todo sigue igual.
- `declineInvitation`: el invitado puede; otro provider no; falla si el post
  no está `OPEN` o si ya aplicó.
- `openJobToPublic`: el dueño puede; otro cliente no; falla sin invitación
  activa o si el post no está `OPEN`.
- Query del feed público excluye posts con `invitedProviderId` lleno.

## Fuera de alcance

- Multi-invitación (invitar a varios trabajadores a la vez).
- Historial de invitaciones rechazadas.
- Notificaciones (email/push) al trabajador invitado — Fase 3 del roadmap.
- Expiración automática de invitaciones.
- Reembolso si nadie toma el trabajo — Fase 4 del roadmap.
