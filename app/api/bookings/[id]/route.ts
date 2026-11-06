import { staffBookerNames } from '@/lib/staff-booker'
import { NextRequest, NextResponse } from 'next/server'
import { eq, and, inArray, arrayOverlaps } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, bookingRequests, users, smsLogs } from '@/lib/db/schema'
import { auth } from '@/auth'
import type { Role } from '@/types/next-auth'
import { LOGISTICS_CATEGORIES } from '@/lib/roles'
import { computeShare } from '@/lib/platform-share'
import { getRatesForVendorMonth } from '@/lib/platform-settings'
import { defaultCancelDeadline, listBranchOptions, resolveBranch } from '@/lib/branches'

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

// 廠商員工：所屬廠商底下、實際訂位人員是自己（比對帳號表姓名）的單據，只給看不給改
async function isBookedByStaff(row: typeof bookings.$inferSelect, userId: string, employerVendorId: string | null | undefined) {
  if (!employerVendorId || row.vendorId !== employerVendorId || !row.actualBooker) return false
  return (await staffBookerNames(userId, employerVendorId)).includes(row.actualBooker)
}

async function getOwnedBooking(id: string, userId: string, roles: Role[], { allowMergedView = false, employerVendorId }: { allowMergedView?: boolean; employerVendorId?: string | null } = {}) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id))
  if (!row) return null
  if (seesAll(roles)) return row
  if (roles.includes('logistics') && (LOGISTICS_CATEGORIES as readonly string[]).includes(row.category)) return row
  if (row.vendorId === userId) return row
  if (allowMergedView && roles.includes('vendor') && (await isMergedWithOwnBooking(id, userId))) return row
  if (allowMergedView && roles.includes('vendor_staff') && (await isBookedByStaff(row, userId, employerVendorId))) return row
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await getOwnedBooking(id, session.user.id, session.user.roles, { allowMergedView: true, employerVendorId: session.user.employerVendorId })
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

  // 分給電話歸屬的人／分給實際訂位人員：不能填負數，兩欄相加也不能超過這筆單的廠商利潤，只有改到其中一欄才需要檢查
  if ((roles.includes('vendor') || roles.includes('admin')) && (body.staffShareAmount !== undefined || body.bookerShareAmount !== undefined)) {
    const newStaffShare = body.staffShareAmount !== undefined ? blankToNull(body.staffShareAmount) : existing.staffShareAmount
    const newBookerShare = body.bookerShareAmount !== undefined ? blankToNull(body.bookerShareAmount) : existing.bookerShareAmount
    if (Number(newStaffShare) < 0 || Number(newBookerShare) < 0) {
      return NextResponse.json({ error: '分潤金額不能是負數' }, { status: 400 })
    }
    const sum = (Number(newStaffShare) || 0) + (Number(newBookerShare) || 0)
    if (sum > 0 && existing.vendorId) {
      const month = (existing.soldDate ?? existing.bookingDate).slice(0, 7)
      const rates = await getRatesForVendorMonth(existing.vendorId, month)
      const share = computeShare(existing, rates)
      if (share && sum > share.vendorProfit) {
        return NextResponse.json({ error: `分潤總額（${sum}）超過這筆單的廠商利潤（${share.vendorProfit}）` }, { status: 400 })
      }
    }
  }

  // 分店：有送 branchId 或 branch 才重新對主檔，沒送就保留原本的
  const branchChanged = !pureCustomerService && (body.branchId !== undefined || body.branch !== undefined)
  const branchOptions = await listBranchOptions()
  const resolved = branchChanged ? await resolveBranch({ branchId: body.branchId, branch: body.branch }, branchOptions) : { branchId: existing.branchId, branch: existing.branch }

  // 退訂期限：清空就照餐廳設定自動算；原本就是自動算出來的值、這次改了日期或分店，也跟著重算；手動填過別的日期就保留
  const nextBookingDate = pureCustomerService ? existing.bookingDate : (body.bookingDate ?? existing.bookingDate)
  const askedDeadline = pureCustomerService ? existing.cancelDeadline : blankToNull(body.cancelDeadline ?? existing.cancelDeadline)
  const wasAuto = !!existing.cancelDeadline && existing.cancelDeadline === (await defaultCancelDeadline(existing.branchId, existing.bookingDate, branchOptions))
  const cancelDeadline = !pureCustomerService && (!askedDeadline || (wasAuto && askedDeadline === existing.cancelDeadline))
    ? ((await defaultCancelDeadline(resolved.branchId, nextBookingDate, branchOptions)) ?? askedDeadline)
    : askedDeadline

  const [row] = await db
    .update(bookings)
    .set({
      branchId: resolved.branchId,
      branch: resolved.branch,
      category: existing.category, // 類別建立後不能改，要改就刪掉重建
      bookingDate: pureCustomerService ? existing.bookingDate : (body.bookingDate ?? existing.bookingDate),
      timeSlot: pureCustomerService ? existing.timeSlot : (body.timeSlot ?? existing.timeSlot),
      partySize: pureCustomerService ? existing.partySize : (body.partySize !== undefined ? Number(body.partySize) || null : existing.partySize),
      bookingCode: pureCustomerService ? existing.bookingCode : (body.bookingCode ?? existing.bookingCode),
      status: body.status ?? existing.status,
      cancelDeadline,
      paymentDeadline: pureCustomerService ? existing.paymentDeadline : blankToNull(body.paymentDeadline ?? existing.paymentDeadline),
      depositAmount: pureCustomerService ? existing.depositAmount : blankToNull(body.depositAmount ?? existing.depositAmount),
      depositPayer: pureCustomerService ? existing.depositPayer : (body.depositPayer ?? existing.depositPayer),
      depositDisbursed: pureCustomerService ? existing.depositDisbursed : (body.depositDisbursed !== undefined ? !!body.depositDisbursed : existing.depositDisbursed),
      depositConfirmed: pureCustomerService ? existing.depositConfirmed : (body.depositConfirmed !== undefined ? !!body.depositConfirmed : existing.depositConfirmed),
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
      staffShareAmount: (roles.includes('vendor') || roles.includes('admin')) ? blankToNull(body.staffShareAmount ?? existing.staffShareAmount) : existing.staffShareAmount,
      bookerShareAmount: (roles.includes('vendor') || roles.includes('admin')) ? blankToNull(body.bookerShareAmount ?? existing.bookerShareAmount) : existing.bookerShareAmount,
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

  // 簡訊留存紀錄外鍵指向這筆單據，刪單據前要先解除關聯（簡訊原文本身還是留著，
  // 只是不再連到已經刪掉的單據），不然會因為外鍵限制整個刪除失敗
  await db.update(smsLogs).set({ bookingId: null }).where(eq(smsLogs.bookingId, id))
  await db.delete(bookings).where(eq(bookings.id, id))
  return NextResponse.json({ ok: true })
}
