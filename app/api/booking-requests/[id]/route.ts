import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookingRequests, bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { auth } from '@/auth'

// 處理需求：把提議的欄位套用回單據，並把需求標記為已完成
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const [existing] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const apply = body.apply !== false // 預設套用提議的變更

  if (apply) {
    // 同一筆需求關聯到的每一筆單據，都套用同一組提議的變更
    for (const bookingId of existing.bookingIds) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
      if (!booking) continue
      await db
        .update(bookings)
        .set({
          branch: existing.proposedBranch ?? booking.branch,
          bookingDate: existing.proposedBookingDate ?? booking.bookingDate,
          timeSlot: existing.proposedTimeSlot ?? booking.timeSlot,
          partySize: existing.proposedPartySize ?? booking.partySize,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
    }
  }

  const [row] = await db
    .update(bookingRequests)
    .set({ status: 'resolved', resolvedById: session.user.id, resolvedAt: new Date() })
    .where(eq(bookingRequests.id, id))
    .returning()

  return NextResponse.json(row)
}

// 刪除需求：管理員/後勤人員可以刪任何一筆（他們在管理這個佇列）；客服只能刪自己發起的
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('admin') && !roles.includes('logistics') && !roles.includes('customer_service'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  const [existing] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const canManageQueue = roles.includes('admin') || roles.includes('logistics')
  if (!canManageQueue && existing.createdById !== session.user.id) {
    return NextResponse.json({ error: '只能刪除自己發起的需求' }, { status: 403 })
  }

  await db.delete(bookingRequests).where(eq(bookingRequests.id, id))
  return NextResponse.json({ ok: true })
}
