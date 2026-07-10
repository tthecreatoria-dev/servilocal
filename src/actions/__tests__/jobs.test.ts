import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockJobPostFindUnique = vi.hoisted(() => vi.fn())
const mockJobPostCreate = vi.hoisted(() => vi.fn())
const mockJobApplicationFindUnique = vi.hoisted(() => vi.fn())
const mockJobApplicationCreate = vi.hoisted(() => vi.fn())
const mockUserFindUnique = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    jobPost: {
      findUnique: mockJobPostFindUnique,
      create: mockJobPostCreate,
    },
    jobApplication: {
      findUnique: mockJobApplicationFindUnique,
      create: mockJobApplicationCreate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    $transaction: mockTransaction,
  },
}))

import { createJobPost, createJobApplication, selectJobApplication, startJob, completeJob } from '@/actions/jobs'

beforeEach(() => {
  mockAuth.mockClear()
  mockJobPostFindUnique.mockClear()
  mockJobPostCreate.mockClear()
  mockJobApplicationFindUnique.mockClear()
  mockJobApplicationCreate.mockClear()
  mockUserFindUnique.mockClear()
  mockTransaction.mockClear()
})

const clientSession = { user: { id: 'client-1', role: 'CLIENT', name: 'Client' } }
const providerSession = { user: { id: 'provider-1', role: 'PROVIDER', name: 'Provider' } }

const validJobPostData = {
  title: 'Fix my pipes',
  description: 'I need someone to fix leaking pipes in my bathroom',
  category: 'PLUMBING' as const,
  budget: 50,
  deadline: '2026-12-31T00:00:00.000Z',
  isRemote: false,
  address: 'Col. Escalón, San Salvador',
  latitude: 13.7,
  longitude: -89.22,
}

const validApplicationData = {
  jobPostId: 'clxxx0000000000000000000000',
  message: 'I can fix your pipes today',
  proposedPrice: 45,
}

const validSelectData = {
  jobPostId: 'clxxx0000000000000000000000',
  applicationId: 'clyyy0000000000000000000000',
}

describe('createJobPost()', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await createJobPost(validJobPostData)
    expect(result).toEqual({ success: false, error: 'unauthorized' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('returns forbidden when role is not CLIENT', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const result = await createJobPost(validJobPostData)
    expect(result).toEqual({ success: false, error: 'forbidden' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('returns validation error when title is too short', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const result = await createJobPost({ ...validJobPostData, title: 'Fix' })
    expect(result).toEqual({ success: false, error: 'validation' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('returns validation error when description is too short', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const result = await createJobPost({ ...validJobPostData, description: 'Too short' })
    expect(result).toEqual({ success: false, error: 'validation' })
    expect(mockJobPostCreate).not.toHaveBeenCalled()
  })

  it('creates job post and returns it on success', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const created = { id: 'job-1', ...validJobPostData, status: 'OPEN', clientId: 'client-1', createdAt: new Date(), updatedAt: new Date() }
    mockJobPostCreate.mockResolvedValueOnce(created)

    const result = await createJobPost(validJobPostData)

    expect(result).toEqual({ success: true, data: created })
    expect(mockJobPostCreate).toHaveBeenCalledWith({
      data: {
        title: 'Fix my pipes',
        description: 'I need someone to fix leaking pipes in my bathroom',
        category: 'PLUMBING',
        budget: 50,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
        clientId: 'client-1',
        isRemote: false,
        address: 'Col. Escalón, San Salvador',
        latitude: 13.7,
        longitude: -89.22,
        invitedProviderId: null,
      },
    })
  })

  it('nulls location fields for a remote job', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const created = { id: 'job-2', status: 'PENDING_PAYMENT', clientId: 'client-1' }
    mockJobPostCreate.mockResolvedValueOnce(created)

    const result = await createJobPost({
      title: 'Design a logo',
      description: 'I need a clean logo for my new bakery brand',
      category: 'DESIGN',
      budget: 80,
      deadline: '2026-12-31T00:00:00.000Z',
      isRemote: true,
    })

    expect(result).toEqual({ success: true, data: created })
    expect(mockJobPostCreate).toHaveBeenCalledWith({
      data: {
        title: 'Design a logo',
        description: 'I need a clean logo for my new bakery brand',
        category: 'DESIGN',
        budget: 80,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
        clientId: 'client-1',
        isRemote: true,
        address: null,
        latitude: null,
        longitude: null,
        invitedProviderId: null,
      },
    })
  })

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
})

describe('createJobApplication()', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'unauthorized' })
  })

  it('returns forbidden when role is not PROVIDER', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'forbidden' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns validation error when message is too short', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const result = await createJobApplication({ ...validApplicationData, message: 'Short' })
    expect(result).toEqual({ success: false, error: 'validation' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns post_not_found when job post does not exist', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({ jobPost: { findUnique: vi.fn().mockResolvedValueOnce(null) }, jobApplication: { findUnique: vi.fn(), create: vi.fn() } })
    )
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'post_not_found' })
  })

  it('returns post_not_open when job post is not OPEN', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({ jobPost: { findUnique: vi.fn().mockResolvedValueOnce({ id: validApplicationData.jobPostId, status: 'ASSIGNED' }) }, jobApplication: { findUnique: vi.fn(), create: vi.fn() } })
    )
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'post_not_open' })
  })

  it('returns already_applied when provider has an existing application', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const txCreate = vi.fn()
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({
        jobPost: { findUnique: vi.fn().mockResolvedValueOnce({ id: validApplicationData.jobPostId, status: 'OPEN' }) },
        jobApplication: { findUnique: vi.fn().mockResolvedValueOnce({ id: 'existing-app' }), create: txCreate },
      })
    )
    const result = await createJobApplication(validApplicationData)
    expect(result).toEqual({ success: false, error: 'already_applied' })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('creates application and returns it on success', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const created = { id: 'app-1', ...validApplicationData, providerId: 'provider-1', status: 'PENDING' }
    const txCreate = vi.fn().mockResolvedValueOnce(created)
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({
        jobPost: { findUnique: vi.fn().mockResolvedValueOnce({ id: validApplicationData.jobPostId, status: 'OPEN' }) },
        jobApplication: { findUnique: vi.fn().mockResolvedValueOnce(null), create: txCreate },
      })
    )

    const result = await createJobApplication(validApplicationData)

    expect(result).toEqual({ success: true, data: created })
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        jobPostId: validApplicationData.jobPostId,
        message: 'I can fix your pipes today',
        proposedPrice: 45,
        providerId: 'provider-1',
      },
    })
  })
})

describe('selectJobApplication()', () => {
  it('returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'unauthorized' })
  })

  it('returns forbidden when role is not CLIENT', async () => {
    mockAuth.mockResolvedValueOnce(providerSession)
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'forbidden' })
    expect(mockJobPostFindUnique).not.toHaveBeenCalled()
  })

  it('returns post_not_found when job post does not exist', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce(null)
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'post_not_found' })
  })

  it('returns post_not_owned when post belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ id: validSelectData.jobPostId, clientId: 'other-client', status: 'OPEN' })
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'post_not_owned' })
  })

  it('returns post_not_open when post is not OPEN', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ id: validSelectData.jobPostId, clientId: 'client-1', status: 'ASSIGNED' })
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'post_not_open' })
  })

  it('returns application_not_found when application does not belong to the post', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ id: validSelectData.jobPostId, clientId: 'client-1', status: 'OPEN' })
    mockJobApplicationFindUnique.mockResolvedValueOnce({ id: validSelectData.applicationId, jobPostId: 'different-post' })
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'application_not_found' })
  })

  it('returns application_not_found when application does not exist', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ id: validSelectData.jobPostId, clientId: 'client-1', status: 'OPEN' })
    mockJobApplicationFindUnique.mockResolvedValueOnce(null)
    const result = await selectJobApplication(validSelectData)
    expect(result).toEqual({ success: false, error: 'application_not_found' })
  })

  it('runs transaction: accepts selected, rejects others, sets post to ASSIGNED', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ id: validSelectData.jobPostId, clientId: 'client-1', status: 'OPEN' })
    mockJobApplicationFindUnique.mockResolvedValueOnce({ id: validSelectData.applicationId, jobPostId: validSelectData.jobPostId })

    const updatedPost = { id: validSelectData.jobPostId, status: 'ASSIGNED', clientId: 'client-1' }
    const txPostFindUnique = vi.fn().mockResolvedValue({ id: validSelectData.jobPostId, status: 'OPEN' })
    const txAppFindUnique = vi.fn().mockResolvedValue({ id: validSelectData.applicationId, status: 'PENDING' })
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 2 })
    const txUpdate = vi.fn().mockResolvedValue({ id: validSelectData.applicationId, status: 'ACCEPTED' })
    const txPostUpdate = vi.fn().mockResolvedValue(updatedPost)

    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) =>
      fn({
        jobPost: { findUnique: txPostFindUnique, update: txPostUpdate },
        jobApplication: { findUnique: txAppFindUnique, updateMany: txUpdateMany, update: txUpdate },
      })
    )

    const result = await selectJobApplication(validSelectData)

    expect(result).toEqual({ success: true, data: updatedPost })
    expect(txPostFindUnique).toHaveBeenCalledWith({ where: { id: validSelectData.jobPostId } })
    expect(txAppFindUnique).toHaveBeenCalledWith({ where: { id: validSelectData.applicationId } })
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { jobPostId: validSelectData.jobPostId, id: { not: validSelectData.applicationId } },
      data: { status: 'REJECTED' },
    })
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: validSelectData.applicationId },
      data: { status: 'ACCEPTED' },
    })
    expect(txPostUpdate).toHaveBeenCalledWith({
      where: { id: validSelectData.jobPostId },
      data: { status: 'ASSIGNED' },
    })
  })
})

describe('startJob()', () => {
  const PROVIDER_SESSION = { user: { id: 'prov_1', role: 'PROVIDER' } }
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-provider roles', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } })
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid ids', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    expect(await startJob({ jobPostId: 'nope' })).toEqual({ success: false, error: 'validation' })
  })

  it('rejects when the post is not ASSIGNED', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({ id: JOB_ID, status: 'OPEN', applications: [] }),
        update: vi.fn(),
      },
    }))
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_assigned' })
  })

  it('rejects a provider who is not the accepted applicant', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, status: 'ASSIGNED',
          applications: [{ providerId: 'someone_else' }],
        }),
        update: vi.fn(),
      },
    }))
    expect(await startJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'not_assigned_provider' })
  })

  it('moves ASSIGNED → IN_PROGRESS for the accepted provider', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    const update = vi.fn().mockResolvedValue({ id: JOB_ID, status: 'IN_PROGRESS' })
    mockTransaction.mockImplementation(async (fn) => fn({
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, status: 'ASSIGNED',
          applications: [{ providerId: 'prov_1' }],
        }),
        update,
      },
    }))
    const result = await startJob({ jobPostId: JOB_ID })
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ where: { id: JOB_ID }, data: { status: 'IN_PROGRESS' } })
  })
})

describe('completeJob()', () => {
  const CLIENT_SESSION = { user: { id: 'client_1', role: 'CLIENT' } }
  const JOB_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(overrides: Record<string, unknown> = {}) {
    return {
      jobPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID, clientId: 'client_1', status: 'IN_PROGRESS', category: 'PLUMBING',
          payment: { id: 'pay_1', status: 'HELD', amount: 100 },
        }),
        update: vi.fn().mockResolvedValue({ id: JOB_ID, status: 'COMPLETED' }),
      },
      jobPayment: { update: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING_PAYOUT' }) },
      commission: { create: vi.fn().mockResolvedValue({ id: 'comm_1' }) },
      ...overrides,
    }
  }

  it('rejects a non-owner client', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'other', role: 'CLIENT' } })
    mockTransaction.mockImplementation(async (fn) => fn(makeTx()))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_owned' })
  })

  it('rejects when the post is not IN_PROGRESS', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    tx.jobPost.findUnique = vi.fn().mockResolvedValue({
      id: JOB_ID, clientId: 'client_1', status: 'ASSIGNED', category: 'PLUMBING',
      payment: { id: 'pay_1', status: 'HELD', amount: 100 },
    })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'post_not_in_progress' })
  })

  it('rejects when the payment is not HELD (no backwards transitions)', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    tx.jobPost.findUnique = vi.fn().mockResolvedValue({
      id: JOB_ID, clientId: 'client_1', status: 'IN_PROGRESS', category: 'PLUMBING',
      payment: { id: 'pay_1', status: 'RELEASED', amount: 100 },
    })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await completeJob({ jobPostId: JOB_ID })).toEqual({ success: false, error: 'payment_not_held' })
  })

  it('records the commission and advances payment + post atomically', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx()
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    const result = await completeJob({ jobPostId: JOB_ID })
    expect(result.success).toBe(true)
    expect(tx.commission.create).toHaveBeenCalledWith({
      data: { jobPaymentId: 'pay_1', amount: 12, rate: 0.12, category: 'PLUMBING' },
    })
    expect(tx.jobPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay_1' }, data: { status: 'PENDING_PAYOUT' },
    })
    expect(tx.jobPost.update).toHaveBeenCalledWith({
      where: { id: JOB_ID }, data: { status: 'COMPLETED' },
    })
  })

  it('aborts everything when commission recording fails', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION)
    const tx = makeTx({ commission: { create: vi.fn().mockRejectedValue(new Error('db down')) } })
    // emulate Prisma: a throw inside the callback rejects the whole transaction
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    await expect(completeJob({ jobPostId: JOB_ID })).rejects.toThrow('db down')
    expect(tx.jobPayment.update).not.toHaveBeenCalled()
    expect(tx.jobPost.update).not.toHaveBeenCalled()
  })
})
