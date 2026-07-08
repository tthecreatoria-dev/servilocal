# Directorio de trabajadores — perfiles públicos con URL amigable

**Fecha:** 2026-07-08
**Estado:** Aprobado (enfoque A)

## Objetivo

Convertir el listado existente de `/providers` en un directorio real: cada trabajador
tiene una página de perfil pública con URL amigable que funciona como su tarjeta de
presentación. Desde el perfil, el cliente puede:

1. **Contratar por la plataforma** (CTA primario) — con garantía, pago en custodia y
   comisión para ServiLocal.
2. **Contactar directo** (CTA secundario, opt-in del trabajador) — sin garantía,
   con aviso explícito de que el contacto directo queda fuera de la protección
   de la plataforma.

Fuera de alcance (iteraciones futuras): invitación formal (`invitedProviderId` en
`JobPost`), foto de perfil con subida de archivos, reseñas (Fase 2 del roadmap).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Contratación vía plataforma | Pre-llenar el formulario `JobPost` existente (categoría pre-seleccionada). Sin cambios en la lógica de pagos. |
| Contacto directo | Opt-in del trabajador (`showPhone`). Usa el `User.phone` existente, no un campo duplicado. |
| URL | `/providers/<slug>` — ej. `servilocal.com/providers/juan-perez` |
| Foto | No por ahora. Avatar de iniciales generado. |

## 1. Esquema (Prisma)

`ProviderProfile` gana dos campos:

```prisma
slug      String  @unique
showPhone Boolean @default(false)
```

**Generación del slug** (nueva función pura en `src/lib/slug.ts`):

- Derivado de `User.name`: minúsculas, sin acentos/diacríticos (NFD strip),
  espacios y caracteres no alfanuméricos → guiones, guiones repetidos colapsados,
  sin guiones al inicio/fin. "Juan Pérez" → `juan-perez`.
- Colisiones: sufijo numérico incremental — `juan-perez-2`, `juan-perez-3`.
- Nombre vacío tras normalizar (p. ej. solo emojis) → fallback `trabajador` + sufijo.
- **Estable de por vida**: se genera una vez (al crear el perfil / en el backfill)
  y no se regenera aunque el usuario cambie de nombre. Es su tarjeta de
  presentación: la URL no debe romperse.

**Migración con backfill**: la migración añade la columna como nullable, un script
de backfill genera slugs para todos los perfiles existentes (orden determinista por
`createdAt` para resolver colisiones), luego la columna pasa a `NOT NULL` + unique.
El registro de nuevos proveedores (donde se cree el `ProviderProfile`) genera el
slug dentro de la misma operación.

## 2. Página pública `/providers/[slug]`

`src/app/(marketplace)/providers/[slug]/page.tsx` — server component, pública
(sin sesión). Slug inexistente → `notFound()`.

Contenido, de arriba hacia abajo:

- **Cabecera**: avatar de iniciales (mismo patrón visual de las tarjetas), nombre,
  chips de categorías (`CATEGORY_LABELS` / `CATEGORY_ICONS` de `src/lib/categories.ts`),
  rating + nº de reseñas, ubicación (`address` o badge "En línea" si `isRemote`).
- **Bio**.
- **Servicios**: los `Service` activos del proveedor con título, descripción y precio.
  Si no tiene servicios, la sección se omite.
- **Bloque de contratación** (ver §3).

**SEO / compartir**: `generateMetadata` con título (`<nombre> — <categoría principal> | ServiLocal`),
descripción tomada de la bio (recortada), y OpenGraph básico usando
`NEXT_PUBLIC_APP_URL`. El objetivo es que el enlace compartido por WhatsApp se vea
como una tarjeta de presentación digna.

## 3. CTAs de contratación

- **"Contratar con garantía"** (botón primario): enlace a
  `/dashboard/jobs/new?category=<primera skill del proveedor>`. El formulario de
  nuevo trabajo lee el query param y pre-selecciona la categoría (validada contra
  `CATEGORY_KEYS`; valor inválido se ignora). Junto al botón, texto de valor:
  pago en custodia, garantía de la plataforma, soporte en disputas.
  Si el visitante no tiene sesión, el flujo existente de protección de rutas lo
  lleva a login y de vuelta.
- **"Contactar directo"** (secundario, **solo si `showPhone === true` y
  `User.phone` no es null/vacío**): botón de WhatsApp (`https://wa.me/<número
  normalizado a formato internacional, El Salvador +503>`) y el teléfono visible.
  Acompañado del aviso: *"El contacto directo ocurre fuera de ServiLocal — sin
  garantía ni protección de pago."*
- **Regla de privacidad dura**: si `showPhone` es false, el teléfono no aparece en
  ninguna parte de la respuesta — ni en el HTML, ni en metadata, ni serializado en
  props. La consulta a la base de datos solo selecciona `phone` cuando
  `showPhone` es true.

## 4. Opt-in en `/dashboard/profile`

- Checkbox "Mostrar mi teléfono en mi perfil público" en el formulario de perfil
  de proveedor. Persiste `showPhone` vía el server action `updateProfile`
  existente (`src/actions/profile.ts`), añadiendo el campo a `UpdateProfileSchema`
  (Zod). Solo aplica a rol `PROVIDER`, igual que los demás campos de proveedor.
- En la misma página se muestra la **URL pública del perfil** con botón de copiar,
  para que el trabajador la comparta como tarjeta de presentación.

## 5. Enlaces de entrada

- `ProviderCard` (`src/components/features/provider-card.tsx`) envuelve la tarjeta
  en un `Link` al perfil (`/providers/<slug>`). `RankedProvider` /
  `ProviderForRanking` (en `src/lib/provider-search.ts`) ganan el campo `slug`.

## 6. Manejo de errores

- Slug no encontrado → `notFound()` (404 estándar del marketplace).
- Backfill de migración: determinista e idempotente; si falla a mitad, re-ejecutable.
- `updateProfile`: sin cambios en su contrato `ActionResult`; `showPhone` inválido
  cae en el error `validation` existente.

## 7. Pruebas

- **`src/lib/slug.ts`** (unit): acentos y ñ ("José Muñoz" → `jose-munoz`),
  colisiones con sufijo, caracteres especiales/emojis, fallback de nombre vacío.
- **Perfil público**: consulta con `showPhone: false` no selecciona ni expone el
  teléfono; slug inexistente → 404.
- **`updateProfile`**: persiste `showPhone`; un rol `CLIENT` no puede tocarlo.
- **Pre-selección de categoría**: query param inválido se ignora sin romper el
  formulario.
