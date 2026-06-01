// src/app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { CreateServiceSchema } from '@/types/schemas'

export async function GET(): Promise<NextResponse> {
  const services = await db.service.findMany({
    where: { isActive: true },
    include: { provider: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(services)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'PROVIDER') {
    return NextResponse.json({ error: 'Only providers can create services' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateServiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 422 })
  }

  const providerProfile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!providerProfile) {
    return NextResponse.json({ error: 'Provider profile not found' }, { status: 404 })
  }

  const service = await db.service.create({
    data: {
      ...parsed.data,
      providerId: providerProfile.id,
    },
  })

  return NextResponse.json(service, { status: 201 })
}
