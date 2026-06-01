'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  CreateJobPostSchema,
  CreateJobApplicationSchema,
  SelectJobApplicationSchema,
} from '@/types/schemas'
import type {
  CreateJobPostInput,
  CreateJobApplicationInput,
  SelectJobApplicationInput,
} from '@/types/schemas'
import type { ActionResult } from '@/types/index'

export async function createJobPost(
  data: CreateJobPostInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.create>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'CLIENT') return { success: false, error: 'forbidden' }

  const parsed = CreateJobPostSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const jobPost = await db.jobPost.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      budget: parsed.data.budget,
      deadline: new Date(parsed.data.deadline),
      clientId: session.user.id,
    },
  })

  return { success: true, data: jobPost }
}

export async function createJobApplication(
  data: CreateJobApplicationInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobApplication.create>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'PROVIDER') return { success: false, error: 'forbidden' }

  const parsed = CreateJobApplicationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  try {
    const application = await db.$transaction(async (tx) => {
      const jobPost = await tx.jobPost.findUnique({ where: { id: parsed.data.jobPostId } })
      if (!jobPost) throw new Error('post_not_found')
      if (jobPost.status !== 'OPEN') throw new Error('post_not_open')

      const existing = await tx.jobApplication.findUnique({
        where: {
          jobPostId_providerId: {
            jobPostId: parsed.data.jobPostId,
            providerId: session.user.id,
          },
        },
      })
      if (existing) throw new Error('already_applied')

      return tx.jobApplication.create({
        data: {
          jobPostId: parsed.data.jobPostId,
          message: parsed.data.message,
          proposedPrice: parsed.data.proposedPrice,
          providerId: session.user.id,
        },
      })
    })
    return { success: true, data: application }
  } catch (error) {
    if (error instanceof Error) {
      const known = ['post_not_found', 'post_not_open', 'already_applied']
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}

export async function selectJobApplication(
  data: SelectJobApplicationInput,
): Promise<ActionResult<Awaited<ReturnType<typeof db.jobPost.update>>>> {
  const session = await auth()
  if (!session) return { success: false, error: 'unauthorized' }
  if (session.user.role !== 'CLIENT') return { success: false, error: 'forbidden' }

  const parsed = SelectJobApplicationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'validation' }

  const jobPost = await db.jobPost.findUnique({ where: { id: parsed.data.jobPostId } })
  if (!jobPost) return { success: false, error: 'post_not_found' }
  if (jobPost.clientId !== session.user.id) return { success: false, error: 'post_not_owned' }
  if (jobPost.status !== 'OPEN') return { success: false, error: 'post_not_open' }

  const application = await db.jobApplication.findUnique({ where: { id: parsed.data.applicationId } })
  if (!application || application.jobPostId !== parsed.data.jobPostId) {
    return { success: false, error: 'application_not_found' }
  }

  try {
    const updatedPost = await db.$transaction(async (tx) => {
      const freshPost = await tx.jobPost.findUnique({ where: { id: parsed.data.jobPostId } })
      if (!freshPost || freshPost.status !== 'OPEN') throw new Error('post_not_open')
      const freshApp = await tx.jobApplication.findUnique({ where: { id: parsed.data.applicationId } })
      if (!freshApp || freshApp.status !== 'PENDING') throw new Error('application_not_pending')
      await tx.jobApplication.updateMany({
        where: { jobPostId: parsed.data.jobPostId, id: { not: parsed.data.applicationId } },
        data: { status: 'REJECTED' },
      })
      await tx.jobApplication.update({
        where: { id: parsed.data.applicationId },
        data: { status: 'ACCEPTED' },
      })
      return tx.jobPost.update({
        where: { id: parsed.data.jobPostId },
        data: { status: 'ASSIGNED' },
      })
    })
    return { success: true, data: updatedPost }
  } catch (error) {
    if (error instanceof Error) {
      const known = ['post_not_open', 'application_not_pending']
      if (known.includes(error.message)) {
        return { success: false, error: error.message }
      }
    }
    throw error
  }
}
