import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
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
    // 臨時單也算進筆數／實收金額（真的有現金流動），但不抽平台費，費率固定 0%，
    // 所以 platformFeeTotal／csShareTotal／platformNetTotal 不會被臨時單影響到
    const rows = await db
      .select()
      .from(bookings)
      .where(and(
        inArray(bookings.category, ['現貨單', '臨時單']),
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
    let bookingCount = 0

    for (const b of rows) {
      const platformFeeRate = b.category === '現貨單'
        ? (b.vendorId ? rateMap.get(`${b.vendorId}|${month}`) : undefined) ?? 20
        : 0
      const r = computeShare(b, { platformFeeRate, csShareOfPlatformRate })
      if (!r) continue
      bookingCount += 1
      agencyFeeTotal += r.actualFee
      vendorProfitTotal += r.vendorProfit
      platformFeeTotal += r.platformFee
    }

    // 客服分潤是「這個月全部平台費總和 × 客服分潤比例」再取整數一次（跟 /api/cs-share/report
    // 的獎金池算法一致），不能把每一筆單據自己先取整數的 csShare 加總——那樣會因為每筆各自
    // 四捨五入，總和跟獎金池對不起來（例如客服分潤頁顯示 45，這裡卻變成 46）
    const csShareTotal = Math.round(platformFeeTotal * csShareOfPlatformRate / 100)
    const platformNetTotal = platformFeeTotal - csShareTotal

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
