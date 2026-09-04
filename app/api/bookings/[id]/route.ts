import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

async function getOwnedBooking(id: string, userId: string, role: string) {
  const rows =
    role === 'vendor'
      ? await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.vendorId, userId)))
      : await db.select().from(bookings).where(eq(bookings.id, id))
  return rows[0] ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await getOwnedBooking(id, session.user.id, session.user.role)
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await getOwnedBooking(id, session.user.id, session.user.role)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const [row] = await db
    .update(bookings)
    .set({
      branch: body.branch ?? existing.branch,
      category: body.category ?? existing.category,
      bookingDate: body.bookingDate ?? existing.bookingDate,
      timeSlot: body.timeSlot ?? existing.timeSlot,
      partySize: body.partySize !== undefined ? Number(body.partySize) || null : existing.partySize,
      bookingCode: body.bookingCode ?? existing.bookingCode,
      status: body.status ?? existing.status,
      cancelDeadline: body.cancelDeadline ?? existing.cancelDeadline,
      paymentDeadline: body.paymentDeadline ?? existing.paymentDeadline,
      depositAmount: body.depositAmount ?? existing.depositAmount,
      depositPayer: body.depositPayer ?? existing.depositPayer,
      customerName: body.customerName ?? existing.customerName,
      customerPhone: body.customerPhone ?? existing.customerPhone,
      source: body.source ?? existing.source,
      soldDate: body.soldDate ?? existing.soldDate,
      collectedAmount: body.collectedAmount ?? existing.collectedAmount,
      account: body.account ?? existing.account,
      salespersonId: body.salespersonId ?? existing.salespersonId,
      agencyFee: body.agencyFee ?? existing.agencyFee,
      info: body.info ?? existing.info,
      note: body.note ?? existing.note,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== 'vendor' && session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await getOwnedBooking(id, session.user.id, session.user.role)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await db.delete(bookings).where(eq(bookings.id, id))
  return NextResponse.json({ ok: true })
}
