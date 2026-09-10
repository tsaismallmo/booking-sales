import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'
import { LOGISTICS_CATEGORIES } from '@/lib/roles'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const roles = session.user.roles
  const isVendor = roles.includes('vendor')
  const isLogistics = roles.includes('logistics')

  // /api/bookings 只回傳「自己的」單據：
  //   vendor（含 admin+vendor）→ 只看 vendorId = 自己
  //   純客服（無 vendor）→ 看全部
  //   純後勤（無 vendor）→ 看後勤類別
  //   純管理員（無 vendor）→ 看全部（管理員通常會走 /api/admin/bookings）
  const rows = isVendor
    ? await db.select().from(bookings).where(eq(bookings.vendorId, session.user.id)).orderBy(desc(bookings.bookingDate))
    : isLogistics
      ? await db.select().from(bookings).where(inArray(bookings.category, [...LOGISTICS_CATEGORIES])).orderBy(desc(bookings.bookingDate))
      : await db.select().from(bookings).orderBy(desc(bookings.bookingDate))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('vendor') && !roles.includes('admin') && !roles.includes('customer_service'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json()

  const isVendor = roles.includes('vendor')
  const isAdmin = roles.includes('admin')
  const isNoVendorCategory = body.category === '臨時單' || body.category === '預定單'

  // 純客服（沒有廠商/管理員身份）只能建立臨時單或預定單，這兩種不是從廠商既有訂位轉過來的
  if (!isVendor && !isAdmin && !isNoVendorCategory) {
    return NextResponse.json({ error: '客服只能建立臨時單或預定單' }, { status: 403 })
  }

  // 現貨單是真實的餐廳訂位，一定要有訂位姓名/電話才能去報到
  if (body.category === '現貨單' && (!body.customerName || !body.customerPhone)) {
    return NextResponse.json({ error: '現貨單要填訂位姓名與電話' }, { status: 400 })
  }

  // 有廠商角色的人只能建立自己的單據；臨時單/預定單不用綁廠商；其他情況（管理員建現貨單）要指定歸屬廠商
  let vendorId: string | null
  if (isVendor) {
    vendorId = session.user.id
  } else if (isNoVendorCategory) {
    vendorId = null
  } else {
    vendorId = body.vendorId || null
    if (!vendorId) return NextResponse.json({ error: '缺少廠商歸屬' }, { status: 400 })
  }

  const [row] = await db
    .insert(bookings)
    .values({
      vendorId,
      branch: body.branch || null,
      category: body.category,
      bookingDate: body.bookingDate,
      timeSlot: body.timeSlot || null,
      partySize: body.partySize ? Number(body.partySize) : null,
      bookingCode: body.bookingCode || null,
      status: body.status || 'unsold',
      cancelDeadline: body.cancelDeadline || null,
      paymentDeadline: body.paymentDeadline || null,
      depositAmount: body.depositAmount || null,
      depositPayer: body.depositPayer || null,
      actualBooker: body.actualBooker || null,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      source: body.source || null,
      isInline: !!body.isInline,
      isEztable: !!body.isEztable,
      soldDate: body.soldDate || null,
      collectedAmount: body.collectedAmount || null,
      account: body.account || null,
      salespersonId: body.salespersonId || null,
      agencyFee: body.agencyFee || null,
      info: body.info || null,
      note: body.note || null,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
