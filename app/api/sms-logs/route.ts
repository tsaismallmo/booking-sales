import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { smsLogs, bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bookingId = req.nextUrl.searchParams.get('bookingId')
  if (!bookingId) return NextResponse.json({ error: '缺少 bookingId' }, { status: 400 })

  // 廠商只能看自己單據上的簡訊紀錄
  if (session.user.role === 'vendor') {
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.vendorId, session.user.id)))
    if (!booking) return NextResponse.json([], { status: 200 })
  }

  const rows = await db.select().from(smsLogs).where(eq(smsLogs.bookingId, bookingId)).orderBy(desc(smsLogs.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.type || !body.rawText) {
    return NextResponse.json({ error: '缺少簡訊類型或內容' }, { status: 400 })
  }

  if (body.bookingId && session.user.role === 'vendor') {
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, body.bookingId), eq(bookings.vendorId, session.user.id)))
    if (!booking) return NextResponse.json({ error: '找不到這筆單據' }, { status: 404 })
  }

  const [row] = await db
    .insert(smsLogs)
    .values({
      type: body.type,
      rawText: body.rawText,
      bookingId: body.bookingId || null,
      parsedData: body.parsedData || null,
      createdById: session.user.id,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
