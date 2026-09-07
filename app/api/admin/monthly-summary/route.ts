import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare } from '@/lib/platform-share'
import { getCsShareRate, getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const from = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { from, to }
}

// 往前推 n 個月（0 = 當月）
function monthBack(n: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const monthsParam = Number(req.nextUrl.searchParams.get('months'))
  const monthCount = Number.isFinite(monthsParam) && monthsParam > 0 ? Math.min(monthsParam, 24) : 12
  const months = Array.from({ length: monthCount }, (_, i) => monthBack(i)) // 最新月份在前

  const results = []
  for (const month of months) {
    const { from, to } = monthRange(month)
    const rows = await db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.category, '現貨單'),
        eq(bookings.status, 'sold'),
        gte(bookings.soldDate, from),
        lte(bookings.soldDate, to)
      ))

    if (rows.length === 0) {
      results.push({
        month, bookingCount: 0,
        agencyFeeTotal: 0, collectedAmountTotal: 0, depositAmountTotal: 0,
        vendorProfitTotal: 0, platformFeeTotal: 0, csShareTotal: 0, platformNetTotal: 0,
      })
      continue
    }

    const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
    const [rateMap, csShareOfPlatformRate] = await Promise.all([
      getVendorPlatformFeeRatesForMonths(vendorIds, [month]),
      getCsShareRate(month),
    ])

    let agencyFeeTotal = 0
    let vendorProfitTotal = 0
    let platformFeeTotal = 0
    let csShareTotal = 0
    let platformNetTotal = 0
    let bookingCount = 0

    for (const b of rows) {
      const platformFeeRate = (b.vendorId ? rateMap.get(`${b.vendorId}|${month}`) : undefined) ?? 20
      const r = computeShare(b, { platformFeeRate, csShareOfPlatformRate })
      if (!r) continue
      bookingCount += 1
      agencyFeeTotal += r.actualFee
      vendorProfitTotal += r.vendorProfit
      platformFeeTotal += r.platformFee
      csShareTotal += r.csShare
      platformNetTotal += r.platformNet
    }

    const collectedAmountTotal = rows.reduce((s, b) => s + (b.collectedAmount ? Number(b.collectedAmount) : 0), 0)
    const depositAmountTotal = rows.reduce((s, b) => s + (b.depositAmount ? Number(b.depositAmount) : 0), 0)

    results.push({
      month, bookingCount,
      agencyFeeTotal, collectedAmountTotal, depositAmountTotal,
      vendorProfitTotal, platformFeeTotal, csShareTotal, platformNetTotal,
    })
  }

  return NextResponse.json({ months: results })
}
