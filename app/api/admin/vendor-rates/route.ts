import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorPlatformRates, bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// 預設抓「上個月」（依伺服器目前日期往前推一個月）
function defaultMonth() {
  const now = new Date()
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const m = now.getMonth() === 0 ? 12 : now.getMonth() // getMonth() 是 0-based，這樣算出來就是上個月
  return `${y}-${pad2(m)}`
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const from = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { from, to }
}

// 全部廠商 + 各自的平台費率（沒設定過的用預設值）+ 指定月份的已售筆數（依售出日期，不是訂位日期，
// 因為這個月賣的可能是下個月甚至下下個月才要用餐的訂位）
export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const month = req.nextUrl.searchParams.get('month') || defaultMonth()
  const { from, to } = monthRange(month)

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

  return NextResponse.json({ month, vendors: result })
}
