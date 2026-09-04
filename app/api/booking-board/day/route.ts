import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 單日明細：只回傳廠商自己（廠商員工則是所屬廠商）的訂位
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: '缺少 date' }, { status: 400 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.vendorId, ownerId), eq(bookings.bookingDate, date)))

  return NextResponse.json(rows)
}
