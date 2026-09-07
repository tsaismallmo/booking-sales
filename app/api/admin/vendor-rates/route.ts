import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorPlatformRates, bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// 預設抓「這個月」（要設定費率的月份），已售筆數的參考月份會再往前推一個月
function defaultMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const from = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { from, to }
}

// 選定月份的前一個月：設定某個月的費率時，參考的是「前一個月」已經確定的銷售量，
// 不是選定月份自己的（選定月份可能都還沒過完）
function prevMonth(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const y2 = m === 1 ? y - 1 : y
  const m2 = m === 1 ? 12 : m - 1
  return `${y2}-${pad2(m2)}`
}

// 全部廠商 + 各自的平台費率（沒設定過的用預設值）+ 前一個月的已售筆數（依售出日期，不是訂位日期，
// 因為那個月賣的可能是之後才要用餐的訂位；參考前一個月是因為要設定的月份本身可能還沒過完）
export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const month = req.nextUrl.searchParams.get('month') || defaultMonth()
  const referenceMonth = prevMonth(month)
  const { from, to } = monthRange(referenceMonth)

  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const rateRows = await db.select().from(vendorPlatformRates).where(eq(vendorPlatformRates.month, month))
  const rateMap = new Map(rateRows.map((r) => [r.vendorId, r.platformFeeRate]))

  const result = []
  for (const v of vendors) {
    const rows = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.vendorId, v.id),
        eq(bookings.category, '現貨單'),
        eq(bookings.status, 'sold'),
        gte(bookings.soldDate, from),
        lte(bookings.soldDate, to)
      ))

    result.push({
      vendorId: v.id,
      name: v.name || v.email,
      email: v.email,
      platformFeeRate: rateMap.get(v.id) ?? DEFAULT_PLATFORM_RATES.platformFeeRate,
      bookingCount: rows.length,
    })
  }

  return NextResponse.json({ month, referenceMonth, vendors: result })
}
