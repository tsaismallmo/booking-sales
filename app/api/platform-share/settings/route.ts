import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRateSettings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

const DEFAULT_RATE = 20

function resolveVendorId(session: NonNullable<Awaited<ReturnType<typeof requireRole>>>, req: NextRequest) {
  if (session.user.roles.includes('vendor')) return session.user.id
  // 管理員一定要指定要看哪個廠商
  return req.nextUrl.searchParams.get('vendorId')
}

export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vendorId = resolveVendorId(session, req)
  if (!vendorId) return NextResponse.json({ error: '缺少 vendorId' }, { status: 400 })

  const [row] = await db.select().from(vendorRateSettings).where(eq(vendorRateSettings.vendorId, vendorId))
  return NextResponse.json(row ?? { vendorId, platformFeeRate: DEFAULT_RATE })
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const vendorId = session.user.roles.includes('vendor') ? session.user.id : body.vendorId
  if (!vendorId) return NextResponse.json({ error: '缺少 vendorId' }, { status: 400 })

  if (session.user.roles.includes('admin') && !session.user.roles.includes('vendor')) {
    const [vendor] = await db.select().from(users).where(eq(users.id, vendorId))
    if (!vendor || !vendor.roles.includes('vendor')) return NextResponse.json({ error: '找不到這個廠商' }, { status: 404 })
  }

  const platformFeeRate = Number(body.platformFeeRate)
  if (Number.isNaN(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 100) {
    return NextResponse.json({ error: '平台費率須在 0–100 之間' }, { status: 400 })
  }

  const [row] = await db
    .insert(vendorRateSettings)
    .values({ vendorId, platformFeeRate })
    .onConflictDoUpdate({
      target: vendorRateSettings.vendorId,
      set: { platformFeeRate, updatedAt: new Date() },
    })
    .returning()

  return NextResponse.json(row)
}
