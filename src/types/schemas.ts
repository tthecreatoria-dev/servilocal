// src/types/schemas.ts
import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const SKILL_VALUES = ['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL'] as const

export const RegisterSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  role:     z.enum(['CLIENT', 'PROVIDER']),
  phone:    z.string().min(7, 'Número de teléfono inválido'),
  skills:   z.array(z.enum(SKILL_VALUES)).optional(),
})

export const CreateServiceSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  price: z.number().positive('Price must be positive'),
  category: z.enum(['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL']),
})

export const CreateServiceRequestSchema = z.object({
  serviceId: z.string().cuid('Invalid service ID'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

export const TkieroWebhookSchema = z.object({
  event: z.enum(['payment.confirmed', 'payment.failed', 'payment.refunded']),
  paymentId: z.string(),
  amount: z.number().positive(),
  metadata: z.union([
    z.object({ jobPostId: z.string(), clientId: z.string() }).strict(),
    z.object({ serviceRequestId: z.string(), clientId: z.string(), providerId: z.string(), category: z.string() }).strict(),
  ]),
  timestamp: z.string(),
})

export const CreateJobPostSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(150, 'Title must be at most 150 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters').max(2000, 'Description must be at most 2000 characters'),
  category: z.enum(['PLUMBING', 'TEACHING', 'DELIVERY', 'CLEANING', 'DESIGN', 'DIGITAL']),
  budget: z.number().positive('Budget must be positive'),
  deadline: z.string().datetime('Deadline must be a valid ISO datetime').refine(
    (d) => new Date(d) > new Date(),
    'Deadline must be in the future',
  ),
})

export const CreateJobApplicationSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000, 'Message must be at most 1000 characters'),
  proposedPrice: z.number().positive('Proposed price must be positive'),
})

export const SelectJobApplicationSchema = z.object({
  jobPostId: z.string().cuid('Invalid job post ID'),
  applicationId: z.string().cuid('Invalid application ID'),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>
export type TkieroWebhookPayload = z.infer<typeof TkieroWebhookSchema>
export type CreateJobPostInput = z.infer<typeof CreateJobPostSchema>
export type CreateJobApplicationInput = z.infer<typeof CreateJobApplicationSchema>
export type SelectJobApplicationInput = z.infer<typeof SelectJobApplicationSchema>
