// src/app/api/services/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const services = await db.service.findMany({
    where: { isActive: true },
    include: { provider: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(services)
}
