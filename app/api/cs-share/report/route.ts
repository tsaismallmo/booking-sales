import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES, type ShareBooking } from '@/lib/platform-share'
import { getCsShareRate, getVendorPlatformFeeRates } from '@/lib/platform-settings'

async function getSalespersonBookings(salespersonId: string, from: string, to: string) {
  return db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.salespersonId, salespersonId),
      eq(bookings.category, '現貨單'),
      eq(bookings.status, 'sold'),
      gte(bookings.bookingDate, from),
      lte(bookings.bookingDate, to)
    ))
}

// 一個客服賣的單可能來自不同廠商，每個廠商的平台費率可能不一樣，
// 所以要照每一筆單據自己的廠商去查費率，不能用單一固定值
function computeShareByOwnVendorRate(
  rows: (ShareBooking & { vendorId: string | null })[],
  vendorRateMap: Map<string, number>,
  csShareOfPlatformRate: number
) {
  return rows.map((b) => {
    const platformFeeRate = (b.vendorId ? vendorRateMap.get(b.vendorId) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
    return computeShare(b, { platformFeeRate, csShareOfPlatformRate })
  }).filter((r) => r !== null)
}

export async function GET(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  const csShareOfPlatformRate = await getCsShareRate()

  const isCS = session.user.roles.includes('customer_service')
  const salespersonId = isCS ? session.user.id : req.nextUrl.searchParams.get('salespersonId')

  if (salespersonId) {
    const rows = await getSalespersonBookings(salespersonId, from, to)
    const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
    const vendorRateMap = await getVendorPlatformFeeRates(vendorIds)
    const results = computeShareByOwnVendorRate(rows, vendorRateMap, csShareOfPlatformRate)
    const totals = results.reduce(
      (acc, r) => ({ csShare: acc.csShare + r.csShare, count: acc.count + 1 }),
      { csShare: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? { ...r, branch: b.branch, customerName: b.customerName, bookingCode: b.bookingCode } : null
    }).filter((r) => r !== null)

    return NextResponse.json({ mode: 'detail', salespersonId, csShareOfPlatformRate, bookings: detail, totals })
  }

  // 管理員沒指定客服：回傳全部客服的彙總
  const csStaff = (await db.select().from(users)).filter((u) => u.roles.includes('customer_service'))
  const staffSummaries = []
  for (const s of csStaff) {
    const rows = await getSalespersonBookings(s.id, from, to)
    const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
    const vendorRateMap = await getVendorPlatformFeeRates(vendorIds)
    const results = computeShareByOwnVendorRate(rows, vendorRateMap, csShareOfPlatformRate)
    if (results.length === 0) continue
    const csShare = results.reduce((sum, r) => sum + r.csShare, 0)
    staffSummaries.push({ salespersonId: s.id, name: s.name || s.email, bookingCount: results.length, csShare })
  }
  const grandTotals = staffSummaries.reduce(
    (acc, s) => ({ csShare: acc.csShare + s.csShare, count: acc.count + s.bookingCount }),
    { csShare: 0, count: 0 }
  )

  return NextResponse.json({ mode: 'summary', csShareOfPlatformRate, staff: staffSummaries, totals: grandTotals })
}
