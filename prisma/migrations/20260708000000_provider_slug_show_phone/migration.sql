-- Public provider profiles: stable slug + phone opt-in.
-- Backfill replicates src/lib/slug.ts semantics; collisions deduped
-- deterministically by (createdAt, id) so re-runs produce identical slugs.

ALTER TABLE "ProviderProfile" ADD COLUMN "showPhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProviderProfile" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT
    pp."id",
    pp."createdAt",
    COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(
          lower(translate(u."name",
            'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
            'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc')),
          '[^a-z0-9]+', '-', 'g')),
        ''),
      'trabajador') AS base_slug
  FROM "ProviderProfile" pp
  JOIN "User" u ON u."id" = pp."userId"
),
numbered AS (
  SELECT
    "id",
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY "createdAt", "id") AS rn
  FROM base
)
UPDATE "ProviderProfile" p
SET "slug" = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || n.rn END
FROM numbered n
WHERE p."id" = n."id";

ALTER TABLE "ProviderProfile" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "ProviderProfile_slug_key" ON "ProviderProfile"("slug");
