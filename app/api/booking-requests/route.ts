import { NextRequest, NextResponse } from 'next/server'
import { eq, and, inArray, arrayOverlaps } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookingRequests, bookings } from '@/lib/db/schema'
import { auth } from '@/auth'
import { LOGISTICS_CATEGORIES } from '@/lib/roles'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const roles = session.user.roles
  const statusFilter = req.nextUrl.searchParams.get('status')
  const bookingId = req.nextUrl.searchParams.get('bookingId')

  // 查特定單據上的需求（給單據詳細頁顯示「需求處理中」用），誰都能查自己看得到的單據
  if (bookingId) {
    const rows = statusFilter
      ? await db.select().from(bookingRequests).where(and(arrayOverlaps(bookingRequests.bookingIds, [bookingId]), eq(bookingRequests.status, statusFilter as 'pending' | 'resolved')))
      : await db.select().from(bookingRequests).where(arrayOverlaps(bookingRequests.bookingIds, [bookingId]))
    return NextResponse.json(rows)
  }

  if (roles.includes('admin')) {
    const rows = statusFilter
      ? await db.select().from(bookingRequests).where(eq(bookingRequests.status, statusFilter as 'pending' | 'resolved'))
      : await db.select().from(bookingRequests)
    return NextResponse.json(rows)
  }

  if (roles.includes('logistics')) {
    const relevantBookings = await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.category, [...LOGISTICS_CATEGORIES]))
    const ids = relevantBookings.map((b) => b.id)
    if (ids.length === 0) return NextResponse.json([])
    const rows = statusFilter
      ? await db.select().from(bookingRequests).where(and(arrayOverlaps(bookingRequests.bookingIds, ids), eq(bookingRequests.status, statusFilter as 'pending' | 'resolved')))
      : await db.select().from(bookingRequests).where(arrayOverlaps(bookingRequests.bookingIds, ids))
    return NextResponse.json(rows)
  }

  // 客服看得到全部需求（不只自己發起的），這樣看板上才能標示「需求處理中」
  if (roles.includes('customer_service')) {
    const rows = statusFilter
      ? await db.select().from(bookingRequests).where(eq(bookingRequests.status, statusFilter as 'pending' | 'resolved'))
      : await db.select().from(bookingRequests)
    return NextResponse.json(rows)
  }

  return NextResponse.json([])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('customer_service') && !roles.includes('admin'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const bookingIds: string[] = Array.isArray(body.bookingIds) ? body.bookingIds : body.bookingId ? [body.bookingId] : []
  if (bookingIds.length === 0) return NextResponse.json({ error: '缺少 bookingIds' }, { status: 400 })

  const [row] = await db
    .insert(bookingRequests)
    .values({
      bookingIds,
      note: body.note || null,
      proposedBranch: body.proposedBranch || null,
      proposedBookingDate: body.proposedBookingDate || null,
      proposedTimeSlot: body.proposedTimeSlot || null,
      proposedPartySize: body.proposedPartySize ? Number(body.proposedPartySize) : null,
      createdById: session.user.id,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
