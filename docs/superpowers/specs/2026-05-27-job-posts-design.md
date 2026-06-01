# Job Posts — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

---

## Overview

Clients can publish open work projects. Providers browse those projects and submit proposals. The client reviews all proposals and selects one provider. This is a demand-side flow that runs parallel to the existing supply-side flow (provider creates `Service` → client sends `ServiceRequest`).

---

## Data Models

Two new Prisma models added to `prisma/schema.prisma`.

### New enums

```prisma
enum JobPostStatus {
  OPEN
  ASSIGNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum JobApplicationStatus {
  PENDING
  ACCEPTED
  REJECTED
}
```

### JobPost

```prisma
model JobPost {
  id             String          @id @default(cuid())
  title          String
  description    String
  category       ServiceCategory
  budgetInTkiero Decimal         @db.Decimal(18, 8)
  deadline       DateTime
  status         JobPostStatus   @default(OPEN)
  clientId       String
  client         User            @relation("ClientJobPosts", fields: [clientId], references: [id])
  applications   JobApplication[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([clientId])
  @@index([category])
  @@index([status])
}
```

### JobApplication

```prisma
model JobApplication {
  id                    String               @id @default(cuid())
  jobPostId             String
  providerId            String
  message               String
  proposedPriceInTkiero Decimal              @db.Decimal(18, 8)
  status                JobApplicationStatus @default(PENDING)
  jobPost               JobPost              @relation(fields: [jobPostId], references: [id], onDelete: Restrict)
  provider              User                 @relation("ProviderApplications", fields: [providerId], references: [id])
  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt

  @@unique([jobPostId, providerId])
  @@index([jobPostId])
  @@index([providerId])
}
```

`@@unique([jobPostId, providerId])` prevents a provider from applying to the same post twice.

### User model additions

```prisma
jobPosts      JobPost[]        @relation("ClientJobPosts")
applications  JobApplication[] @relation("ProviderApplications")
```

---

## Zod Schemas

Added to `src/types/schemas.ts`:

```ts
export const CreateJobPostSchema = z.object({
  title:          z.string().min(5),
  description:    z.string().min(20),
  category:       z.enum(['PLUMBING','TEACHING','DELIVERY','CLEANING','DESIGN','DIGITAL']),
  budgetInTkiero: z.number().positive(),
  deadline:       z.string().datetime(),
})

export const CreateJobApplicationSchema = z.object({
  jobPostId:             z.string().cuid(),
  message:               z.string().min(10),
  proposedPriceInTkiero: z.number().positive(),
})

export const SelectJobApplicationSchema = z.object({
  jobPostId:     z.string().cuid(),
  applicationId: z.string().cuid(),
})
```

---

## Server Actions

File: `src/actions/jobs.ts`

All actions return `ActionResult<T>`:

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

### `createJobPost(data: CreateJobPostInput)`

- Requires authenticated session with role `CLIENT`
- Validates input with `CreateJobPostSchema`
- Creates `JobPost` with `status: OPEN`, `clientId` from session
- Returns the created `JobPost`

### `createJobApplication(data: CreateJobApplicationInput)`

- Requires authenticated session with role `PROVIDER`
- Validates input with `CreateJobApplicationSchema`
- Guards: post must exist, post status must be `OPEN`, provider must not have an existing application for this post (caught via `@@unique` constraint)
- Creates `JobApplication` with `status: PENDING`
- Returns the created `JobApplication`

### `selectJobApplication(data: SelectJobApplicationInput)`

- Requires authenticated session with role `CLIENT`
- Validates input with `SelectJobApplicationSchema`
- Guards: post must exist, post must belong to the authenticated client, application must belong to the post, post status must be `OPEN`
- Uses `prisma.$transaction` to:
  1. Set the selected `JobApplication` to `ACCEPTED`
  2. Set all other `JobApplication`s for the same post to `REJECTED`
  3. Set the `JobPost` status to `ASSIGNED`
- Returns the updated `JobPost`

---

## Pages

### Dashboard (CLIENT only)

| Route | Purpose |
|---|---|
| `/dashboard/jobs` | List of the authenticated client's job posts. Shows title, category, deadline, proposal count, status. Button to create new post. |
| `/dashboard/jobs/new` | Form with 5 fields: title, description, category, budgetInTkiero, deadline. Calls `createJobPost` on submit. Redirects to `/dashboard/jobs` on success. |
| `/dashboard/jobs/[id]` | Detail view for one post. Lists all received `JobApplication`s (provider name, message, proposed price). If post is `OPEN`, shows a "Select" button per proposal that calls `selectJobApplication`. |

Role guard: if authenticated user is not `CLIENT`, redirect to `/dashboard`.

### Marketplace (PROVIDER only)

| Route | Purpose |
|---|---|
| `/(marketplace)/jobs` | List of all `JobPost`s with status `OPEN`. Filterable by category. Shows title, category, budget, deadline. |
| `/(marketplace)/jobs/[id]` | Detail view. If the authenticated provider has not applied yet, shows the application form (message + proposedPriceInTkiero). If already applied, shows their application status. |

Role guard: if authenticated user is not `PROVIDER`, redirect to `/`.

### Route protection

- `/dashboard/*` is already protected by the existing middleware (requires session)
- Role-level guards are enforced inside each page and server action, not in middleware, to allow specific error messages

---

## Error Handling

| Action | Error codes |
|---|---|
| `createJobPost` | `unauthorized`, `forbidden`, `validation` |
| `createJobApplication` | `unauthorized`, `forbidden`, `post_not_found`, `post_not_open`, `already_applied` |
| `selectJobApplication` | `unauthorized`, `forbidden`, `post_not_found`, `post_not_owned`, `application_not_found`, `post_not_open` |

- Zod failures return `{ success: false, error: 'validation', issues: [...] }`
- Business rule failures return `{ success: false, error: 'code' }` so the UI can display a translated message
- `prisma.$transaction` in `selectJobApplication` guarantees atomicity — no partial state possible

---

## Out of scope

- Payment / Transaction creation after a provider is selected (next iteration)
- Job post editing or deletion by the client
- Provider rating or review tied to job posts
- Real-time notifications when a new application arrives
