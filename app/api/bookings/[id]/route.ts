import { NextRequest, NextResponse } from 'next/server'
import { eq, and, inArray, arrayOverlaps } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, bookingRequests, users } from '@/lib/db/schema'
import { auth } from '@/auth'
import type { Role } from '@/types/next-auth'
import { LOGISTICS_CATEGORIES } from '@/lib/roles'

// 日期/數字欄位如果表單留空，前端送的是空字串 ''，但資料庫的 date/numeric 欄位不接受空字串，要轉成 null
function blankToNull<T>(v: T): T | null {
  return v === '' ? null : v
}

function seesAll(roles: Role[]) {
  return roles.includes('admin') || roles.includes('customer_service')
}

// 這筆單是不是跟「我自己擁有的某一筆單」同一個轉需求（合併需求可能跨廠商），
// 有的話只給看，不給改/刪——不然合併需求裡另一個廠商完全看不到對方是誰、要怎麼配合
async function isMergedWithOwnBooking(id: string, userId: string) {
  const groups = await db.select({ bookingIds: bookingRequests.bookingIds }).from(bookingRequests).where(arrayOverlaps(bookingRequests.bookingIds, [id]))
  if (groups.length === 0) return false
  const otherIds = [...new Set(groups.flatMap((g) => g.bookingIds).filter((bid) => bid !== id))]
  if (otherIds.length === 0) return false
  const [ownedSibling] = await db.select({ id: bookings.id }).from(bookings).where(and(inArray(bookings.id, otherIds), eq(bookings.vendorId, userId)))
  return !!ownedSibling
}

async function getOwnedBooking(id: string, userId: string, roles: Role[], { allowMergedView = false }: { allowMergedView?: boolean } = {}) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id))
  if (!row) return null
  if (seesAll(roles)) return row
  if (roles.includes('logistics') && (LOGISTICS_CATEGORIES as readonly string[]).includes(row.category)) return row
  if (row.vendorId === userId) return row
  if (allowMergedView && roles.includes('vendor') && (await isMergedWithOwnBooking(id, userId))) return row
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await getOwnedBooking(id, session.user.id, session.user.roles, { allowMergedView: true })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 附上廠商名稱，不用讓前端另外去查整個帳號名冊（廠商角色查不到、開放的話又會看到其他廠商的名單）
  let vendorName: string | null = null
  if (row.vendorId) {
    const [vendor] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, row.vendorId))
    vendorName = vendor ? (vendor.name ?? vendor.email) : null
  }

  return NextResponse.json({ ...row, vendorName })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await getOwnedBooking(id, session.user.id, session.user.roles)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const roles = session.user.roles
  // 純客服（沒有廠商/管理員身份）只能改狀態、銷售/收款，不能碰分店/日期/金流/訂位資訊等基本資訊，
  // 那些要走「轉需求」讓後勤人員處理
  const pureCustomerService = roles.includes('customer_service') && !roles.includes('vendor') && !roles.includes('admin')

  const [row] = await db
    .update(bookings)
    .set({
      branch: pureCustomerService ? existing.branch : (body.branch ?? existing.branch),
      category: existing.category, // 類別建立後不能改，要改就刪掉重建
      bookingDate: pureCustomerService ? existing.bookingDate : (body.bookingDate ?? existing.bookingDate),
      timeSlot: pureCustomerService ? existing.timeSlot : (body.timeSlot ?? existing.timeSlot),
      partySize: pureCustomerService ? existing.partySize : (body.partySize !== undefined ? Number(body.partySize) || null : existing.partySize),
      bookingCode: pureCustomerService ? existing.bookingCode : (body.bookingCode ?? existing.bookingCode),
      status: body.status ?? existing.status,
      cancelDeadline: pureCustomerService ? existing.cancelDeadline : blankToNull(body.cancelDeadline ?? existing.cancelDeadline),
      paymentDeadline: pureCustomerService ? existing.paymentDeadline : blankToNull(body.paymentDeadline ?? existing.paymentDeadline),
      depositAmount: pureCustomerService ? existing.depositAmount : blankToNull(body.depositAmount ?? existing.depositAmount),
      depositPayer: pureCustomerService ? existing.depositPayer : (body.depositPayer ?? existing.depositPayer),
      actualBooker: pureCustomerService ? existing.actualBooker : (body.actualBooker ?? existing.actualBooker),
      customerName: pureCustomerService ? existing.customerName : (body.customerName ?? existing.customerName),
      customerPhone: pureCustomerService ? existing.customerPhone : (body.customerPhone ?? existing.customerPhone),
      source: pureCustomerService ? existing.source : (body.source ?? existing.source),
      isInline: pureCustomerService ? existing.isInline : (body.isInline !== undefined ? !!body.isInline : existing.isInline),
      isEztable: pureCustomerService ? existing.isEztable : (body.isEztable !== undefined ? !!body.isEztable : existing.isEztable),
      vendorId: roles.includes('admin') ? (body.vendorId !== undefined ? (body.vendorId || null) : existing.vendorId) : existing.vendorId,
      soldDate: blankToNull(body.soldDate ?? existing.soldDate),
      collectedAmount: blankToNull(body.collectedAmount ?? existing.collectedAmount),
      account: body.account ?? existing.account,
      salespersonId: body.salespersonId !== undefined ? (body.salespersonId || null) : existing.salespersonId,
      agencyFee: blankToNull(body.agencyFee ?? existing.agencyFee),
      soldCount: body.soldCount !== undefined ? (body.soldCount === '' || body.soldCount === null ? null : Number(body.soldCount)) : existing.soldCount,
      platformFeeBase: roles.includes('admin') ? blankToNull(body.platformFeeBase ?? existing.platformFeeBase) : existing.platformFeeBase,
      info: body.info ?? existing.info,
      note: body.note ?? existing.note,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('vendor') && !roles.includes('admin') && !roles.includes('customer_service'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await getOwnedBooking(id, session.user.id, roles)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 純客服（沒有廠商/管理員身份）不能刪現貨單，只能刪臨時單/預定單
  const pureCustomerService = roles.includes('customer_service') && !roles.includes('vendor') && !roles.includes('admin')
  if (pureCustomerService && existing.category === '現貨單') {
    return NextResponse.json({ error: '客服不能刪除現貨單' }, { status: 403 })
  }

  await db.delete(bookings).where(eq(bookings.id, id))
  return NextResponse.json({ ok: true })
}
