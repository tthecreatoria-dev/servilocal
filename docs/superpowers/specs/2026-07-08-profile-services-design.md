# Perfil como hub + gestión de servicios del proveedor

**Fecha:** 2026-07-08
**Estado:** Aprobado

## Objetivo

El botón del header con el nombre del usuario debe llevar al perfil, donde el
proveedor puede editar sus datos y gestionar los servicios que ofrece (con
precio). Las propuestas enviadas y su estado (incluido "Rechazada") ya existen
en `/dashboard/applications` y solo deben quedar accesibles desde la navegación.

## Contexto actual

- `/dashboard/profile` ya existe: formulario de datos personales, enlace al
  perfil público y método de cobro. No está enlazada desde ningún nav.
- `/dashboard/applications` ya muestra las propuestas con estados
  En revisión / Aceptada / Rechazada, y el rechazo automático ya funciona:
  al elegir el cliente una propuesta, las demás pasan a `REJECTED`
  (`src/actions/jobs.ts`).
- El modelo `Service` (título, descripción, precio, categoría, `isActive`)
  existe sin UI de gestión. El perfil público (`/providers/[slug]`) ya muestra
  los servicios activos (`src/lib/provider-profile.ts` filtra `isActive: true`).
- `CreateServiceSchema` ya existe en `src/types/schemas.ts`.
- Existe un `POST /api/services` sin consumidores que va contra la convención
  del proyecto (API routes solo para webhooks/integraciones).

## Decisiones de alcance

- **Servicios = escaparate.** Se muestran en el perfil público como catálogo.
  La contratación sigue por el flujo actual de proyectos (JobPost →
  JobApplication). No se conecta `ServiceRequest` a pagos.
- **Gestión de servicios dentro de `/dashboard/profile`**, como sección debajo
  del formulario de perfil (elección del usuario), no como página aparte.
- **Sin borrar servicios**: `Service` tiene FK restrictiva con `ServiceRequest`;
  activar/desactivar cumple el propósito y desactivar ya oculta el servicio
  del perfil público.

## Cambios

### 1. Navegación

- `src/components/features/site-header.tsx`: el botón con el nombre del
  usuario apunta a `/dashboard/profile` (ambos roles), en lugar de
  `/dashboard/applications` / `/dashboard/jobs`.
- `src/app/dashboard/layout.tsx`: nueva pestaña "Mi perfil" →
  `/dashboard/profile` visible para ambos roles, junto a las pestañas
  existentes ("Mis proyectos" cliente, "Mis propuestas" proveedor).

### 2. Server actions de servicios — `src/actions/services.ts` (nuevo)

Tres actions, siguiendo el patrón de resultado tipado de las actions
existentes (`{ success, data | error }`):

- `createService(input)` — valida con `CreateServiceSchema`; requiere sesión
  con rol `PROVIDER` y `ProviderProfile` existente; crea el servicio ligado a
  ese perfil.
- `updateService(input)` — nuevo `UpdateServiceSchema` en
  `src/types/schemas.ts` (id + campos de `CreateServiceSchema`); verifica que
  el servicio pertenezca al `ProviderProfile` del usuario en sesión antes de
  actualizar.
- `toggleServiceActive(input)` — schema con id + `isActive`; misma
  verificación de propiedad; alterna `isActive`.

Las tres revalidan `/dashboard/profile` y el perfil público
(`/providers/[slug]` del proveedor).

### 3. UI — sección "Mis servicios" en `/dashboard/profile`

- Nuevo componente cliente
  `src/app/dashboard/profile/services-manager.tsx`, renderizado solo para
  proveedores, debajo de las secciones existentes.
- Lista de servicios del proveedor (activos e inactivos, los inactivos
  atenuados) con título, precio, categoría y estado.
- Formulario crear/editar: título, descripción, precio, categoría (select con
  `CATEGORY_LABELS` de `src/lib/categories.ts`). Editar rellena el formulario.
- Botón activar/desactivar por servicio.
- `page.tsx` consulta los servicios del proveedor (todos, no solo activos) y
  los pasa como initial data.

### 4. Limpieza

- Eliminar el handler `POST` de `src/app/api/services/route.ts` (duplicaría
  la lógica del server action; sin consumidores). El `GET` se conserva.

### 5. Tests — `src/actions/__tests__/services.test.ts` (nuevo)

Mismo patrón de mocks que los tests de actions existentes:

- Sin sesión → `unauthorized`.
- Rol `CLIENT` → `forbidden`.
- `PROVIDER` sin `ProviderProfile` → error.
- Input inválido (Zod) → error de validación.
- `updateService` / `toggleServiceActive` sobre servicio de otro proveedor →
  rechazo.
- Creación, edición y toggle correctos.

## Fuera de alcance

- Contratación directa de servicios (`ServiceRequest` + pagos).
- Borrado de servicios.
- Cambios en `/dashboard/applications` (ya cumple el requisito).
- Bottom-nav móvil del marketplace.
