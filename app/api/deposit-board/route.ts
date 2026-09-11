import { NextResponse } from 'next/server'
import { and, eq, isNotNull, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 訂金付款看板：列出這個廠商（廠商員工看所屬廠商）底下全部有填訂金的單據，
// 不分有沒有標記付款人員——單純給廠商自己盤點訂金付款狀況用。
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vendorId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!vendorId) return NextResponse.json([])

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.vendorId, vendorId), isNotNull(bookings.depositAmount)))
    .orderBy(desc(bookings.bookingDate))

  return NextResponse.json(rows)
}
