import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES, type ShareBooking } from '@/lib/platform-share'
import { DEFAULT_COEFFICIENT, getCsShareRatesForMonths, loadShareRateContext, platformRateFor, type ShareRateContext } from '@/lib/platform-settings'

// 依「售出日期」篩選期間，不是訂位日期——月份報表要看的是這個月實際賣了什麼，
// 不是這個月有哪些訂位要用餐（訂位日期可能是任何月份）。
// 臨時單現在跟現貨單一樣正常算平台費，一起撈出來列在畫面上、也算進分潤金額。
async function getVendorBookings(vendorId: string, from: string, to: string) {
  return db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.vendorId, vendorId),
      inArray(bookings.category, ['現貨單', '臨時單']),
      eq(bookings.status, 'sold'),
      gte(bookings.soldDate, from),
      lte(bookings.soldDate, to)
    ))
    // 沒有 orderBy 的話 Postgres 不保證回傳順序，每次查詢（包括存檔後）順序都可能不一樣，
    // 畫面上的列表看起來就會亂跳——固定用訂位日期＋時段排序，順序才會穩定
    .orderBy(asc(bookings.bookingDate), asc(bookings.timeSlot))
}

// 抽成 % ＝ 銷售平台基本 % × 廠商係數，係數、客服分潤比例都是按「售出月份」設定的，
// 同一份報表裡的單據可能是不同月份賣出的，所以每一筆都要照自己的售出日期去查那個月的係數。
function computeShareByOwnSoldMonth(
  rows: (ShareBooking & { vendorId: string | null; salesChannelId: string | null; soldDate: string | null; category: string })[],
  rateCtx: ShareRateContext,
  csRateMap: Map<string, number>
) {
  return rows.map((b) => {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const { platformFeeRate, coefficient, channel } = platformRateFor(rateCtx, b, month)
    const csShareOfPlatformRate = (month ? csRateMap.get(month) : undefined) ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
    const r = computeShare(b, { platformFeeRate, csShareOfPlatformRate })
    return r ? { ...r, coefficient, channelName: channel.name, channelBaseRate: channel.baseRate } : null
  }).filter((r) => r !== null)
}

export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  // 明確指定 vendorId 的話一律照指定的來；沒指定時，純廠商（沒有管理員身份）預設看自己的，
  // 管理員預設看全部彙總——理由同 cs-share/report
  const isAdmin = session.user.roles.includes('admin')
  const isVendor = session.user.roles.includes('vendor')
  const queryVendorId = req.nextUrl.searchParams.get('vendorId')
  const vendorId = queryVendorId || (isVendor && !isAdmin ? session.user.id : null)

  if (vendorId) {
    const rows = await getVendorBookings(vendorId, from, to)
    const queryMonth = from.slice(0, 7)
    const months = [...new Set([queryMonth, ...rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m)])]
    const [rateCtx, csRateMap] = await Promise.all([
      loadShareRateContext([vendorId], months),
      getCsShareRatesForMonths(months),
    ])
    const results = computeShareByOwnSoldMonth(rows, rateCtx, csRateMap)
    const totals = results.reduce(
      (acc, r) => ({ platformFee: acc.platformFee + r.platformFee, vendorProfit: acc.vendorProfit + r.vendorProfit, count: acc.count + 1 }),
      { platformFee: 0, vendorProfit: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? {
        ...r,
        category: b.category,
        branch: b.branch,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        actualBooker: b.actualBooker,
        bookingCode: b.bookingCode,
        staffShareAmount: b.staffShareAmount === null ? null : Number(b.staffShareAmount),
        bookerShareAmount: b.bookerShareAmount === null ? null : Number(b.bookerShareAmount),
      } : null
    }).filter((r) => r !== null)
    // 查詢區間通常就是頁面選的那個月：回傳那個月的係數，和各銷售平台算出來的抽成 %
    const coefficient = rateCtx.coefficients.get(`${vendorId}|${queryMonth}`) ?? DEFAULT_COEFFICIENT
    const channelRates = rateCtx.channels.map((c) => ({ name: c.name, baseRate: c.baseRate, rate: Number((c.baseRate * coefficient).toFixed(4)) }))
    // 各銷售平台分開小計（月底跟各平台對帳用）
    const byChannel = [...results.reduce((m, r) => {
      const cur = m.get(r.channelName) ?? { channelName: r.channelName, count: 0, platformFee: 0, vendorProfit: 0 }
      m.set(r.channelName, { ...cur, count: cur.count + 1, platformFee: cur.platformFee + r.platformFee, vendorProfit: cur.vendorProfit + r.vendorProfit })
      return m
    }, new Map<string, { channelName: string; count: number; platformFee: number; vendorProfit: number }>()).values()]

    return NextResponse.json({ mode: 'detail', vendorId, coefficient, channelRates, byChannel, bookings: detail, totals })
  }

  // 管理員沒指定廠商：回傳全部廠商的彙總（每一筆單據照自己售出月份的費率算）
  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const vendorSummaries = []
  for (const v of vendors) {
    const rows = await getVendorBookings(v.id, from, to)
    if (rows.length === 0) continue
    const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
    const [rateCtx, csRateMap] = await Promise.all([
      loadShareRateContext([v.id], months),
      getCsShareRatesForMonths(months),
    ])
    const results = computeShareByOwnSoldMonth(rows, rateCtx, csRateMap)
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
