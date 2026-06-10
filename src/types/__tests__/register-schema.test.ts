import { describe, it, expect } from 'vitest'
import { RegisterSchema } from '@/types/schemas'

const base = {
  email: 'worker@example.com',
  password: 'password123',
  name: 'Worker One',
  phone: '+50379000000',
}

describe('RegisterSchema location rules', () => {
  it('accepts a CLIENT without location', () => {
    const parsed = RegisterSchema.safeParse({ ...base, role: 'CLIENT' })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-remote PROVIDER missing coordinates', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['PLUMBING'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts a non-remote PROVIDER with full location', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['PLUMBING'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.6929,
      longitude: -89.2182,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a remote PROVIDER without coordinates', () => {
    const parsed = RegisterSchema.safeParse({
      ...base,
      role: 'PROVIDER',
      skills: ['TEACHING'],
      isRemote: true,
    })
    expect(parsed.success).toBe(true)
  })
})
