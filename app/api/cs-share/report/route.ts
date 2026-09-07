import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES, type ShareBooking } from '@/lib/platform-share'
import { getCsShareRatesForMonths, getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

// 依「售出日期」篩選期間，不是訂位日期，原因同 platform-share
async function getSalespersonBookings(salespersonId: string, from: string, to: string) {
  return db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.salespersonId, salespersonId),
      eq(bookings.category, '現貨單'),
      eq(bookings.status, 'sold'),
      gte(bookings.soldDate, from),
      lte(bookings.soldDate, to)
    ))
}

// 一個客服賣的單可能來自不同廠商、不同售出月份，平台費率、客服分潤比例都是按售出月份設定的，
// 所以要照每一筆單據自己的廠商跟售出日期去查那個月的費率，不能用單一固定值
function computeShareByOwnVendorMonth(
  rows: (ShareBooking & { vendorId: string | null; soldDate: string | null })[],
  vendorRateMap: Map<string, number>,
  csRateMap: Map<string, number>
) {
  return rows.map((b) => {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const vendorKey = b.vendorId && month ? `${b.vendorId}|${month}` : null
    const platformFeeRate = (vendorKey ? vendorRateMap.get(vendorKey) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
    const csShareOfPlatformRate = (month ? csRateMap.get(month) : undefined) ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
    return computeShare(b, { platformFeeRate, csShareOfPlatformRate })
  }).filter((r) => r !== null)
}

async function buildRateMaps(rows: { vendorId: string | null; soldDate: string | null }[]) {
  const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
  const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
  const [vendorRateMap, csRateMap] = await Promise.all([
    getVendorPlatformFeeRatesForMonths(vendorIds, months),
    getCsShareRatesForMonths(months),
  ])
  return { vendorRateMap, csRateMap }
}

export async function GET(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  // 明確指定 salespersonId 的話一律照指定的來；沒指定時，純客服（沒有管理員身份）預設看自己的，
  // 管理員（就算同時也是客服）預設看全部彙總——不然管理員在自己也是客服的帳號上會被強制導去看自己的資料
  const isAdmin = session.user.roles.includes('admin')
  const isCS = session.user.roles.includes('customer_service')
  const queryStaffId = req.nextUrl.searchParams.get('salespersonId')
  const salespersonId = queryStaffId || (isCS && !isAdmin ? session.user.id : null)

  if (salespersonId) {
    const rows = await getSalespersonBookings(salespersonId, from, to)
    const { vendorRateMap, csRateMap } = await buildRateMaps(rows)
    const results = computeShareByOwnVendorMonth(rows, vendorRateMap, csRateMap)
    const totals = results.reduce(
      (acc, r) => ({ csShare: acc.csShare + r.csShare, count: acc.count + 1 }),
      { csShare: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? { ...r, branch: b.branch, customerName: b.customerName, bookingCode: b.bookingCode } : null
    }).filter((r) => r !== null)

    return NextResponse.json({ mode: 'detail', salespersonId, bookings: detail, totals })
  }

  // 管理員沒指定客服：回傳全部客服的彙總
  const csStaff = (await db.select().from(users)).filter((u) => u.roles.includes('customer_service'))
  const staffSummaries = []
  for (const s of csStaff) {
    const rows = await getSalespersonBookings(s.id, from, to)
    if (rows.length === 0) continue
    const { vendorRateMap, csRateMap } = await buildRateMaps(rows)
    const results = computeShareByOwnVendorMonth(rows, vendorRateMap, csRateMap)
    if (results.length === 0) continue
    const csShare = results.reduce((sum, r) => sum + r.csShare, 0)
    staffSummaries.push({ salespersonId: s.id, name: s.name || s.email, bookingCount: results.length, csShare })
  }
  const grandTotals = staffSummaries.reduce(
    (acc, s) => ({ csShare: acc.csShare + s.csShare, count: acc.count + s.bookingCount }),
    { csShare: 0, count: 0 }
  )

  return NextResponse.json({ mode: 'summary', staff: staffSummaries, totals: grandTotals })
}
