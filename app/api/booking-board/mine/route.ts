import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 廠商（廠商員工則是所屬廠商）自己的全部訂位，
// 給月曆分頁做「可訂位名單」比對跟「當天訂位明細」用
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const rows = await db.select().from(bookings).where(eq(bookings.vendorId, ownerId))
  return NextResponse.json(rows)
}
