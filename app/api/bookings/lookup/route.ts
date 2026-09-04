import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

// 依訂位代號查單據，給「付款完成簡訊」比對用。
// 訂位代號每天都從 1001 開始重算，光靠代號完全無法唯一識別一筆單據，
// 一定要連同分店＋日期＋時段＋人數＋金額一起比對才能確定是同一筆。
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const code = params.get('code')
  if (!code) return NextResponse.json({ error: '缺少訂位代號' }, { status: 400 })

  const branch = params.get('branch')
  const bookingDate = params.get('bookingDate')
  const timeSlot = params.get('timeSlot')
  const partySize = params.get('partySize')
  const amount = params.get('amount')

  if (!branch || !bookingDate || !timeSlot || !partySize || !amount) {
    return NextResponse.json(
      { match: null, ambiguous: true, error: '訂位代號每天都會重複，缺少分店/日期/時段/人數/金額就無法安全比對' },
      { status: 400 }
    )
  }

  const seesAll = session.user.roles.includes('admin') || session.user.roles.includes('customer_service')
  const candidates = seesAll
    ? await db.select().from(bookings).where(eq(bookings.bookingCode, code))
    : await db.select().from(bookings).where(and(eq(bookings.bookingCode, code), eq(bookings.vendorId, session.user.id)))

  // 不管訂位代號查到幾筆，一律都要用分店/日期/時段/人數/金額再驗證過，
  // 絕不能因為代號剛好只查到一筆就直接當成是它。
  const narrowed = candidates.filter(
    (c) =>
      c.branch === branch &&
      c.bookingDate === bookingDate &&
      c.timeSlot === timeSlot &&
      c.partySize === Number(partySize) &&
      c.depositAmount != null &&
      Number(c.depositAmount) === Number(amount)
  )

  if (narrowed.length === 1) {
    return NextResponse.json({ match: narrowed[0], ambiguous: false })
  }

  if (narrowed.length === 0) {
    return NextResponse.json({ match: null, ambiguous: false })
  }

  return NextResponse.json({ match: null, ambiguous: true, candidateCount: narrowed.length })
}
