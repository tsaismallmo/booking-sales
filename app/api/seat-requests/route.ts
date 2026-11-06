import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequests, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { resolveBranch } from '@/lib/branches'
import { findStock, matchesStock } from '@/lib/seat-requests'

// 訂位需求看板：客服／管理員／後勤都能看。每筆附上「現在現貨單有幾筆符合」，
// 登記之後現貨單才出現符合的位子時，看板上也看得到，可以直接用現貨不用再去訂
export async function GET() {
  const session = await requireRole('customer_service', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const rows = await db
    .select({ request: seatRequests, createdByName: users.name })
    .from(seatRequests)
    .leftJoin(users, eq(seatRequests.createdById, users.id))
    .orderBy(desc(seatRequests.createdAt))
  const stock = await findStock(rows.filter((r) => r.request.status === 'pending').map((r) => r.request))

  return NextResponse.json(rows.map(({ request, createdByName }) => ({
    ...request,
    createdByName,
    stockMatches: request.status === 'pending' ? stock.filter((b) => matchesStock(request, b)) : [],
  })))
}

// 登記訂位需求：客服／管理員
export async function POST(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const resolved = await resolveBranch({ branchId: body.branchId, branch: body.branch })
  if (!resolved.branchId) return NextResponse.json({ error: '請選擇餐廳和分店' }, { status: 400 })
  if (!body.bookingDate) return NextResponse.json({ error: '請填日期' }, { status: 400 })

  const [row] = await db.insert(seatRequests).values({
    branchId: resolved.branchId,
    branch: resolved.branch,
    bookingDate: body.bookingDate,
    timeSlot: body.timeSlot || null,
    partySize: body.partySize ? Number(body.partySize) || null : null,
    customerName: body.customerName || null,
    customerPhone: body.customerPhone || null,
    note: body.note || null,
    createdById: session.user.id,
  }).returning()

  return NextResponse.json(row, { status: 201 })
}
