import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

// 依訂位代號查單據，給「付款完成簡訊」比對用
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: '缺少訂位代號' }, { status: 400 })

  const rows =
    session.user.role === 'vendor'
      ? await db.select().from(bookings).where(and(eq(bookings.bookingCode, code), eq(bookings.vendorId, session.user.id)))
      : await db.select().from(bookings).where(eq(bookings.bookingCode, code))

  return NextResponse.json(rows[0] ?? null)
}
