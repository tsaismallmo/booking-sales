import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES, type ShareBooking } from '@/lib/platform-share'
import { getCsShareRate, getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

async function getVendorBookings(vendorId: string, from: string, to: string) {
  return db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.vendorId, vendorId),
      eq(bookings.category, '現貨單'),
      eq(bookings.status, 'sold'),
      gte(bookings.bookingDate, from),
      lte(bookings.bookingDate, to)
    ))
}

// 平台費率是按「廠商 + 售出月份」設定的，同一份報表裡的單據可能是不同月份賣出的，
// 所以每一筆都要照自己的售出日期去查那個月的費率，不能套用單一固定值
function computeShareByOwnSoldMonth(
  rows: (ShareBooking & { vendorId: string | null; soldDate: string | null })[],
  rateMap: Map<string, number>,
  csShareOfPlatformRate: number
) {
  return rows.map((b) => {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const key = b.vendorId && month ? `${b.vendorId}|${month}` : null
    const platformFeeRate = (key ? rateMap.get(key) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
    return computeShare(b, { platformFeeRate, csShareOfPlatformRate })
  }).filter((r) => r !== null)
}

export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  const csShareOfPlatformRate = await getCsShareRate()

  const isVendor = session.user.roles.includes('vendor')
  const vendorId = isVendor ? session.user.id : req.nextUrl.searchParams.get('vendorId')

  if (vendorId) {
    const rows = await getVendorBookings(vendorId, from, to)
    const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
    const rateMap = await getVendorPlatformFeeRatesForMonths([vendorId], months)
    const results = computeShareByOwnSoldMonth(rows, rateMap, csShareOfPlatformRate)
    const totals = results.reduce(
      (acc, r) => ({
        platformFee: acc.platformFee + r.platformFee,
        vendorProfit: acc.vendorProfit + r.vendorProfit,
        count: acc.count + 1,
      }),
      { platformFee: 0, vendorProfit: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? { ...r, branch: b.branch, customerName: b.customerName, bookingCode: b.bookingCode } : null
    }).filter((r) => r !== null)

    return NextResponse.json({ mode: 'detail', vendorId, bookings: detail, totals })
  }

  // 管理員沒指定廠商：回傳全部廠商的彙總（每一筆單據照自己售出月份的費率算）
  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const vendorSummaries = []
  for (const v of vendors) {
    const rows = await getVendorBookings(v.id, from, to)
    if (rows.length === 0) continue
    const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
    const rateMap = await getVendorPlatformFeeRatesForMonths([v.id], months)
    const results = computeShareByOwnSoldMonth(rows, rateMap, csShareOfPlatformRate)
    if (results.length === 0) continue
    const totals = results.reduce(
      (acc, r) => ({ platformFee: acc.platformFee + r.platformFee, vendorProfit: acc.vendorProfit + r.vendorProfit }),
      { platformFee: 0, vendorProfit: 0 }
    )
    vendorSummaries.push({
      vendorId: v.id,
      vendorName: v.name || v.email,
      bookingCount: results.length,
      platformFee: totals.platformFee,
      vendorProfit: totals.vendorProfit,
    })
  }
  const grandTotals = vendorSummaries.reduce(
    (acc, v) => ({ platformFee: acc.platformFee + v.platformFee, vendorProfit: acc.vendorProfit + v.vendorProfit, count: acc.count + v.bookingCount }),
    { platformFee: 0, vendorProfit: 0, count: 0 }
  )

  return NextResponse.json({ mode: 'summary', vendors: vendorSummaries, totals: grandTotals })
}
