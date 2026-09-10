import { NextRequest, NextResponse } from 'next/server'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookingRequests, bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

// 處理需求：把提議的欄位套用回單據，並把需求標記為已完成
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const [existing] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const roles = session.user.roles
  // 管理員／後勤本來就能處理任何需求；廠商（含廠商員工）只要需求裡包含自己的單就能處理，
  // 就算是跨廠商的合併需求也算（自己的那部分算數就好，不用整組都是自己的單）
  let canResolveThis = roles.includes('admin') || roles.includes('logistics')
  if (!canResolveThis && (roles.includes('vendor') || roles.includes('vendor_staff'))) {
    const ownerId = roles.includes('vendor') ? session.user.id : session.user.employerVendorId
    if (ownerId) {
      const [ownedInGroup] = await db.select({ id: bookings.id }).from(bookings)
        .where(and(inArray(bookings.id, existing.bookingIds), eq(bookings.vendorId, ownerId)))
      canResolveThis = !!ownedInGroup
    }
  }
  if (!canResolveThis) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

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
    .set({ status: 'resolved', resolvedById: session.user.id, resolvedByName: body.resolvedByName || null, resolvedAt: new Date() })
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
