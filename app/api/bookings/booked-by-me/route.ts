import { NextResponse } from 'next/server'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { staffBookerNames } from '@/lib/staff-booker'

// 廠商員工的單據管理：只看所屬廠商底下、「實際訂位人員」是自己的單據。
// actualBooker 是文字，可能是帳號姓名，也可能是自己名單的名稱（見 staffBookerNames）。
export async function GET() {
  const session = await requireRole('vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vendorId = session.user.employerVendorId
  const names = await staffBookerNames(session.user.id, vendorId)
  const bookerName = names.length > 0 ? names.join('、') : null
  if (!vendorId || names.length === 0) return NextResponse.json({ bookerName, bookings: [] })

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.vendorId, vendorId), inArray(bookings.actualBooker, names)))
    .orderBy(desc(bookings.bookingDate))

  return NextResponse.json({ bookerName, bookings: rows })
}
