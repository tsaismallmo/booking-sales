import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users, vendorPlatformRates } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'

// 全部廠商 + 各自的平台費率（沒設定過的用預設值）
export async function GET() {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const rateRows = await db.select().from(vendorPlatformRates)
  const rateMap = new Map(rateRows.map((r) => [r.vendorId, r.platformFeeRate]))

  const result = vendors.map((v) => ({
    vendorId: v.id,
    name: v.name || v.email,
    email: v.email,
    platformFeeRate: rateMap.get(v.id) ?? DEFAULT_PLATFORM_RATES.platformFeeRate,
  }))

  return NextResponse.json(result)
}
