import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('admin') && !roles.includes('customer_service'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const code = req.nextUrl.searchParams.get('code')
  if (code) {
    const rows = await db.select({
      id: bookings.id,
      branch: bookings.branch,
      bookingDate: bookings.bookingDate,
      bookingCode: bookings.bookingCode,
      category: bookings.category,
      customerName: bookings.customerName,
      status: bookings.status,
    }).from(bookings).where(eq(bookings.bookingCode, code))
    return NextResponse.json(rows)
  }

  const rows = await db.select().from(bookings).orderBy(desc(bookings.bookingDate))
  return NextResponse.json(rows)
}
