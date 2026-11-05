import { NextResponse } from 'next/server'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 廠商員工的單據管理：只看所屬廠商底下、「實際訂位人員」是自己的單據
// （actualBooker 是自由輸入的文字，跟訂金付款看板的付款人員一樣，比對的是帳號表裡的姓名）。
export async function GET() {
  const session = await requireRole('vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vendorId = session.user.employerVendorId
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.user.id))
  const bookerName = me?.name ?? null
  if (!vendorId || !bookerName) return NextResponse.json({ bookerName, bookings: [] })

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.vendorId, vendorId), eq(bookings.actualBooker, bookerName)))
    .orderBy(desc(bookings.bookingDate))

  return NextResponse.json({ bookerName, bookings: rows })
}
