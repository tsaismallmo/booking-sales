import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES, type ShareBooking } from '@/lib/platform-share'
import { getCsShareRatesForMonths, getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

// 依「售出日期」篩選期間，不是訂位日期——月份報表要看的是這個月實際賣了什麼，
// 不是這個月有哪些訂位要用餐（訂位日期可能是任何月份）。
// 臨時單現在也可能有廠商歸屬、也可能賣出，所以也一起撈出來列在畫面上，
// 但不算進分潤金額——分潤的抽成安排本來就只針對現貨單，臨時單只是給廠商知道賣了。
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
}

// 平台費率、客服分潤比例都是按「售出月份」設定的，同一份報表裡的單據可能是不同月份賣出的，
// 所以每一筆都要照自己的售出日期去查那個月的費率，不能套用單一固定值。
// 臨時單不抽平台費，費率固定當 0%（廠商拿全額），不查廠商設定的費率。
function computeShareByOwnSoldMonth(
  rows: (ShareBooking & { vendorId: string | null; soldDate: string | null; category: string })[],
  vendorRateMap: Map<string, number>,
  csRateMap: Map<string, number>
) {
  return rows.map((b) => {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const vendorKey = b.vendorId && month ? `${b.vendorId}|${month}` : null
    const platformFeeRate = b.category === '現貨單'
      ? (vendorKey ? vendorRateMap.get(vendorKey) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
      : 0
    const csShareOfPlatformRate = (month ? csRateMap.get(month) : undefined) ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
    return computeShare(b, { platformFeeRate, csShareOfPlatformRate })
  }).filter((r) => r !== null)
}

export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  // 明確指定 vendorId 的話一律照指定的來；沒指定時，純廠商（沒有管理員身份）預設看自己的，
  // 廠商員工（沒有管理員身份）預設看所屬廠商的，管理員（就算同時也是廠商）預設看全部彙總——理由同 cs-share/report
  const isAdmin = session.user.roles.includes('admin')
  const isVendor = session.user.roles.includes('vendor')
  const isVendorStaff = session.user.roles.includes('vendor_staff')
  const queryVendorId = req.nextUrl.searchParams.get('vendorId')
  const vendorId = queryVendorId
    || (isVendor && !isAdmin ? session.user.id : null)
    || (isVendorStaff && !isAdmin ? session.user.employerVendorId : null)

  // 廠商員工如果沒有設定所屬廠商，不能讓他掉到下面「管理員看全部廠商」的分支
  if (isVendorStaff && !isAdmin && !vendorId) return NextResponse.json({ mode: 'detail', vendorId: null, platformFeeRate: 0, bookings: [], totals: { platformFee: 0, vendorProfit: 0, count: 0 } })

  if (vendorId) {
    const rows = await getVendorBookings(vendorId, from, to)
    const queryMonth = from.slice(0, 7)
    const months = [...new Set([queryMonth, ...rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m)])]
    const [vendorRateMap, csRateMap] = await Promise.all([
      getVendorPlatformFeeRatesForMonths([vendorId], months),
      getCsShareRatesForMonths(months),
    ])
    const results = computeShareByOwnSoldMonth(rows, vendorRateMap, csRateMap)
    // 分潤金額只算現貨單；臨時單就算算出了 platformFee/vendorProfit 也不能加進總計，只是拿來顯示
    const categoryById = new Map(rows.map((b) => [b.id, b.category]))
    const totals = results.reduce(
      (acc, r) => (categoryById.get(r.id) === '現貨單'
        ? { platformFee: acc.platformFee + r.platformFee, vendorProfit: acc.vendorProfit + r.vendorProfit, count: acc.count + 1 }
        : acc),
      { platformFee: 0, vendorProfit: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? { ...r, category: b.category, branch: b.branch, customerName: b.customerName, bookingCode: b.bookingCode } : null
    }).filter((r) => r !== null)
    // 查詢區間通常就是頁面選的那個月，直接把那個月的費率一起回傳，前端不用再一筆一筆列
    const platformFeeRate = vendorRateMap.get(`${vendorId}|${queryMonth}`) ?? DEFAULT_PLATFORM_RATES.platformFeeRate

    return NextResponse.json({ mode: 'detail', vendorId, platformFeeRate, bookings: detail, totals })
  }

  // 管理員沒指定廠商：回傳全部廠商的彙總（每一筆單據照自己售出月份的費率算）
  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const vendorSummaries = []
  for (const v of vendors) {
    const rows = await getVendorBookings(v.id, from, to)
    if (rows.length === 0) continue
    const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
    const [vendorRateMap, csRateMap] = await Promise.all([
      getVendorPlatformFeeRatesForMonths([v.id], months),
      getCsShareRatesForMonths(months),
    ])
    const results = computeShareByOwnSoldMonth(rows, vendorRateMap, csRateMap)
    if (results.length === 0) continue
    // 管理員的全廠商彙總只看金額，這裡沒有像單一廠商那樣的明細列表可以順便顯示臨時單，
    // 所以彙總維持只算現貨單，跟明細頁的「不算進總計」邏輯一致
    const categoryById = new Map(rows.map((b) => [b.id, b.category]))
    const feeResults = results.filter((r) => categoryById.get(r.id) === '現貨單')
    if (feeResults.length === 0) continue
    const totals = feeResults.reduce(
      (acc, r) => ({ platformFee: acc.platformFee + r.platformFee, vendorProfit: acc.vendorProfit + r.vendorProfit }),
      { platformFee: 0, vendorProfit: 0 }
    )
    vendorSummaries.push({
      vendorId: v.id,
      vendorName: v.name || v.email,
      bookingCount: feeResults.length,
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
