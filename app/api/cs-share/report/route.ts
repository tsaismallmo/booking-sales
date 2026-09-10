import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'
import { getCsShareRate, getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

// 客服分潤不是一筆一筆單獨算的，是先算出一個獎金池，每個客服再照自己賣出量佔全部客服賣出量的
// 比例（成交率）去分這個池子：
//   1. 獎金池 = 這個月「全部廠商」現貨單的平台費總和 × 客服分潤比例（月）
//   2. 成交率 = 這個客服賣出的單量 ÷ 全部客服賣出的單量（現貨單＋臨時單都算，臨時單本身
//      沒有平台費可以分，但賣出的量還是算業績）
//   3. 這個客服分到的錢 = 獎金池 × 成交率
// 依「售出日期」篩選期間，不是訂位日期，原因同 platform-share。

// 這個月全部廠商的現貨單平台費總和（不分廠商），拿來當客服分潤獎金池的基礎
async function computeTotalPlatformFee(from: string, to: string) {
  const rows = await db.select().from(bookings).where(and(
    eq(bookings.category, '現貨單'),
    eq(bookings.status, 'sold'),
    gte(bookings.soldDate, from),
    lte(bookings.soldDate, to)
  ))
  if (rows.length === 0) return 0

  const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
  const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
  const vendorRateMap = await getVendorPlatformFeeRatesForMonths(vendorIds, months)

  let total = 0
  for (const b of rows) {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const vendorKey = b.vendorId && month ? `${b.vendorId}|${month}` : null
    const platformFeeRate = (vendorKey ? vendorRateMap.get(vendorKey) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
    const r = computeShare(b, { platformFeeRate, csShareOfPlatformRate: 0 })
    if (r) total += r.platformFee
  }
  return total
}

// 全部客服（不分是誰）賣出的單，用來當成交率的分母；只算有指定銷售人員的單
async function getAllSoldBookingsWithSalesperson(from: string, to: string) {
  return db.select().from(bookings).where(and(
    inArray(bookings.category, ['現貨單', '臨時單']),
    eq(bookings.status, 'sold'),
    isNotNull(bookings.salespersonId),
    gte(bookings.soldDate, from),
    lte(bookings.soldDate, to)
  ))
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

  // 獎金池、全部客服的成交量，這兩個是公司共用的，跟查哪個客服無關；月份用查詢區間的起始月
  const [totalPlatformFee, csShareOfPlatformRate, allSoldRows] = await Promise.all([
    computeTotalPlatformFee(from, to),
    getCsShareRate(from.slice(0, 7)),
    getAllSoldBookingsWithSalesperson(from, to),
  ])
  const pool = Math.round(totalPlatformFee * csShareOfPlatformRate / 100)
  const totalSoldCount = allSoldRows.length

  if (salespersonId) {
    const myRows = allSoldRows.filter((b) => b.salespersonId === salespersonId)
    const csShare = totalSoldCount > 0 ? Math.round(pool * myRows.length / totalSoldCount) : 0
    const bookings_ = myRows
      .map((b) => ({
        id: b.id,
        category: b.category,
        bookingDate: b.bookingDate,
        partySize: b.partySize,
        branch: b.branch,
        customerName: b.customerName,
        bookingCode: b.bookingCode,
      }))
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))

    return NextResponse.json({
      mode: 'detail',
      salespersonId,
      bookings: bookings_,
      totals: { count: myRows.length, csShare },
    })
  }

  // 管理員沒指定客服：回傳全部客服的彙總
  const csStaff = (await db.select().from(users)).filter((u) => u.roles.includes('customer_service'))
  const staffSummaries = csStaff
    .map((s) => {
      const count = allSoldRows.filter((b) => b.salespersonId === s.id).length
      if (count === 0) return null
      const csShare = totalSoldCount > 0 ? Math.round(pool * count / totalSoldCount) : 0
      return { salespersonId: s.id, name: s.name || s.email, bookingCount: count, csShare }
    })
    .filter((s) => s !== null)

  return NextResponse.json({
    mode: 'summary',
    staff: staffSummaries,
    totals: { count: totalSoldCount, csShare: pool },
  })
}
