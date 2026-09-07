import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { csShareRates } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'

export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const month = req.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: '缺少月份' }, { status: 400 })

  const [row] = await db.select().from(csShareRates).where(eq(csShareRates.month, month))
  return NextResponse.json(row ?? { month, csShareOfPlatformRate: DEFAULT_PLATFORM_RATES.csShareOfPlatformRate })
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const month: string = body.month
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '缺少月份' }, { status: 400 })
  }
  const csShareOfPlatformRate = Number(body.csShareOfPlatformRate)
  if (Number.isNaN(csShareOfPlatformRate) || csShareOfPlatformRate < 0 || csShareOfPlatformRate > 100) {
    return NextResponse.json({ error: '比例須在 0–100 之間' }, { status: 400 })
  }

  // 只更新這個月的設定，不會動到其他月份
  const [row] = await db
    .insert(csShareRates)
    .values({ month, csShareOfPlatformRate })
    .onConflictDoUpdate({
      target: csShareRates.month,
      set: { csShareOfPlatformRate, updatedAt: new Date() },
    })
    .returning()

  return NextResponse.json(row)
}
