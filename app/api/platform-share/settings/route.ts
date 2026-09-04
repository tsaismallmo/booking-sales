import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRateSettings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

const DEFAULTS = { weekdayRate: 300, weekendRate: 300, platformFeePerPerson: 100 }

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
  return NextResponse.json(row ?? { vendorId, ...DEFAULTS })
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

  const weekdayRate = Number(body.weekdayRate)
  const weekendRate = Number(body.weekendRate)
  const platformFeePerPerson = Number(body.platformFeePerPerson)
  if ([weekdayRate, weekendRate, platformFeePerPerson].some((n) => Number.isNaN(n) || n < 0)) {
    return NextResponse.json({ error: '金額格式錯誤' }, { status: 400 })
  }

  const [row] = await db
    .insert(vendorRateSettings)
    .values({ vendorId, weekdayRate, weekendRate, platformFeePerPerson })
    .onConflictDoUpdate({
      target: vendorRateSettings.vendorId,
      set: { weekdayRate, weekendRate, platformFeePerPerson, updatedAt: new Date() },
    })
    .returning()

  return NextResponse.json(row)
}
