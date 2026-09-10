import { NextRequest, NextResponse } from 'next/server'
import { and, gte, lte, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, bookingRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 月曆總覽：不分廠商，回傳整個平台每天「未出售」的訂位筆數 + 有待處理需求的筆數
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const year = Number(req.nextUrl.searchParams.get('year'))
  const month = Number(req.nextUrl.searchParams.get('month')) // 1-12
  if (!year || !month) return NextResponse.json({ error: '缺少 year/month' }, { status: 400 })

  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const monthBookings = await db
    .select({ id: bookings.id, bookingDate: bookings.bookingDate })
    .from(bookings)
    .where(and(gte(bookings.bookingDate, start), lte(bookings.bookingDate, end), eq(bookings.status, 'unsold')))

  const pendingRequests = await db
    .select({ bookingIds: bookingRequests.bookingIds })
    .from(bookingRequests)
    .where(eq(bookingRequests.status, 'pending'))

  const pendingIdSet = new Set(pendingRequests.flatMap((r) => r.bookingIds))

  const byDate: Record<string, { total: number; need: number }> = {}
  for (const b of monthBookings) {
    const entry = byDate[b.bookingDate] ?? { total: 0, need: 0 }
    entry.total += 1
    if (pendingIdSet.has(b.id)) entry.need += 1
    byDate[b.bookingDate] = entry
  }

  return NextResponse.json(byDate)
}
