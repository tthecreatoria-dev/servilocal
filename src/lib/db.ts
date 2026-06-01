import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const adapter = new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

function getDb(): PrismaClient {
  const cached = globalForPrisma.prisma
  if (cached) return cached
  const client = createClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  return client
}

// Lazy proxy: defers client creation until first property access.
// This prevents DATABASE_URL errors at module load time during Next.js builds.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    const client = getDb()
    const val = Reflect.get(client, prop, client)
    return typeof val === 'function' ? (val as Function).bind(client) : val
  },
})
