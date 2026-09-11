import { NextResponse } from 'next/server'
import { and, eq, isNotNull, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 訂金付款看板：廠商本人看得到底下全部有填訂金的單據；廠商員工只看得到自己付款的
// （付款人員 depositPayer 是自由輸入的文字，比對的是帳號表裡的姓名，不是 session 裡
// Google 登入帶來的顯示名稱，因為系統其他地方選付款人員也都是照帳號表的姓名選）。
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const isVendor = session.user.roles.includes('vendor')
  const vendorId = isVendor ? session.user.id : session.user.employerVendorId
  if (!vendorId) return NextResponse.json([])

  const conditions = [eq(bookings.vendorId, vendorId), isNotNull(bookings.depositAmount)]

  if (!isVendor) {
    const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.user.id))
    if (!me?.name) return NextResponse.json([])
    conditions.push(eq(bookings.depositPayer, me.name))
  }

  const rows = await db
    .select()
    .from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.bookingDate))

  return NextResponse.json(rows)
}
