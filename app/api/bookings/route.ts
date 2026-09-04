import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows =
    session.user.role === 'vendor'
      ? await db.select().from(bookings).where(eq(bookings.vendorId, session.user.id)).orderBy(desc(bookings.bookingDate))
      : await db.select().from(bookings).orderBy(desc(bookings.bookingDate))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || (session.user.role !== 'vendor' && session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // 廠商只能建立自己的單據；管理員可以指定歸屬廠商
  const vendorId = session.user.role === 'vendor' ? session.user.id : body.vendorId
  if (!vendorId) return NextResponse.json({ error: '缺少廠商歸屬' }, { status: 400 })

  const [row] = await db
    .insert(bookings)
    .values({
      vendorId,
      branch: body.branch || null,
      category: body.category,
      bookingDate: body.bookingDate,
      timeSlot: body.timeSlot || null,
      partySize: body.partySize ? Number(body.partySize) : null,
      bookingCode: body.bookingCode || null,
      status: body.status || 'unsold',
      cancelDeadline: body.cancelDeadline || null,
      paymentDeadline: body.paymentDeadline || null,
      depositAmount: body.depositAmount || null,
      depositPayer: body.depositPayer || null,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      source: body.source || null,
      soldDate: body.soldDate || null,
      collectedAmount: body.collectedAmount || null,
      account: body.account || null,
      salespersonId: body.salespersonId || null,
      agencyFee: body.agencyFee || null,
      info: body.info || null,
      note: body.note || null,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
