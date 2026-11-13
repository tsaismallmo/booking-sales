import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorPlatformRates, bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { channelOf, DEFAULT_COEFFICIENT, listSalesChannels } from '@/lib/platform-settings'

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

// 全部廠商 + 各自這個月的係數（沒設定過是 1）+ 前一個月賣出的成果（依售出日期，不是訂位日期，
// 因為那個月賣的可能是之後才要用餐的訂位；參考前一個月是因為要設定的月份本身可能還沒過完），
// 成果分銷售平台列出筆數和代訂費，管理員看完再決定這個月的係數
export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const month = req.nextUrl.searchParams.get('month') || defaultMonth()
  const referenceMonth = prevMonth(month)
  const { from, to } = monthRange(referenceMonth)

  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const rateRows = await db.select().from(vendorPlatformRates).where(eq(vendorPlatformRates.month, month))
  const coefMap = new Map(rateRows.map((r) => [r.vendorId, Number(r.coefficient)]))
  const channels = await listSalesChannels()

  const sold = await db.select({ vendorId: bookings.vendorId, salesChannelId: bookings.salesChannelId, agencyFee: bookings.agencyFee })
    .from(bookings)
    .where(and(
      inArray(bookings.category, ['現貨單', '臨時單']),
      eq(bookings.status, 'sold'),
      gte(bookings.soldDate, from),
      lte(bookings.soldDate, to)
    ))

  const result = vendors.map((v) => {
    const mine = sold.filter((b) => b.vendorId === v.id)
    const byChannel = channels.map((c) => {
      const rows = mine.filter((b) => channelOf({ channels }, b.salesChannelId).id === c.id)
      return { channelId: c.id, channelName: c.name, count: rows.length, agencyFee: rows.reduce((s, b) => s + (Number(b.agencyFee) || 0), 0) }
    })
    return {
      vendorId: v.id,
      name: v.name || v.email,
      email: v.email,
      coefficient: coefMap.get(v.id) ?? DEFAULT_COEFFICIENT,
      bookingCount: mine.length,
      agencyFeeTotal: mine.reduce((s, b) => s + (Number(b.agencyFee) || 0), 0),
      byChannel,
    }
  })

  return NextResponse.json({ month, referenceMonth, channels, vendors: result })
}
