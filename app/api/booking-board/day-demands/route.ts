import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, bookingRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { LOGISTICS_CATEGORIES } from '@/lib/roles'

// 「需求」只會發生在臨時單／預定單（現貨單是廠商自己的訂位，不會被轉需求），
// 所以這裡不用照廠商歸屬篩選，是全平台當天的臨時單/預定單裡有待處理需求的
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: '缺少 date' }, { status: 400 })

  const dayBookings = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.bookingDate, date), inArray(bookings.category, [...LOGISTICS_CATEGORIES])))
  if (dayBookings.length === 0) return NextResponse.json([])

  const pendingRequests = await db
    .select({ bookingIds: bookingRequests.bookingIds })
    .from(bookingRequests)
    .where(eq(bookingRequests.status, 'pending'))
  const pendingIdSet = new Set(pendingRequests.flatMap((r) => r.bookingIds))

  return NextResponse.json(dayBookings.filter((b) => pendingIdSet.has(b.id)))
}
