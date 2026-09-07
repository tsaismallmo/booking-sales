import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { platformSettings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'

export async function GET() {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'global'))
  return NextResponse.json(row ?? { key: 'global', csShareOfPlatformRate: DEFAULT_PLATFORM_RATES.csShareOfPlatformRate })
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const csShareOfPlatformRate = Number(body.csShareOfPlatformRate)
  if (Number.isNaN(csShareOfPlatformRate) || csShareOfPlatformRate < 0 || csShareOfPlatformRate > 100) {
    return NextResponse.json({ error: '比例須在 0–100 之間' }, { status: 400 })
  }

  const [row] = await db
    .insert(platformSettings)
    .values({ key: 'global', csShareOfPlatformRate })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { csShareOfPlatformRate, updatedAt: new Date() },
    })
    .returning()

  return NextResponse.json(row)
}
