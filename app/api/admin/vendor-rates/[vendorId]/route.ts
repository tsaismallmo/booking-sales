import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { vendorPlatformRates, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '@/lib/auth-guard'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { vendorId } = await params
  const [vendor] = await db.select().from(users).where(eq(users.id, vendorId))
  if (!vendor || !vendor.roles.includes('vendor')) return NextResponse.json({ error: '找不到這個廠商' }, { status: 404 })

  const body = await req.json()
  const month: string = body.month
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '缺少月份' }, { status: 400 })
  }
  const platformFeeRate = Number(body.platformFeeRate)
  if (Number.isNaN(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 100) {
    return NextResponse.json({ error: '平台費率須在 0–100 之間' }, { status: 400 })
  }

  // 只更新這個月的設定，不會動到其他月份
  const [row] = await db
    .insert(vendorPlatformRates)
    .values({ vendorId, month, platformFeeRate })
    .onConflictDoUpdate({
      target: [vendorPlatformRates.vendorId, vendorPlatformRates.month],
      set: { platformFeeRate, updatedAt: new Date() },
    })
    .returning()

  return NextResponse.json(row)
}
