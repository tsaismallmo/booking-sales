import { NextRequest, NextResponse } from 'next/server'
import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequestOptions, seatRequests, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { resolveBranch } from '@/lib/branches'
import { expirePastOptions, findStock, matchesStock, taipeiToday } from '@/lib/seat-requests'

// 訂位需求看板：客服／管理員／後勤都能看。一個客人一筆，底下是依順位排的候選日期。
// 還在等的候選附上「現在現貨單有幾筆符合」，登記之後現貨單才出現位子時看板上也看得到
export async function GET() {
  const session = await requireRole('customer_service', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 已完成的需求不顯示在看板上（在 JS 這邊濾，不在 SQL 比對 enum，資料庫還沒加 completed 時也不會出錯）
  const readAll = () => Promise.all([
    db.select({ request: seatRequests, createdByName: users.name })
      .from(seatRequests)
      .leftJoin(users, eq(seatRequests.createdById, users.id))
      .orderBy(desc(seatRequests.createdAt)),
    db.select().from(seatRequestOptions).orderBy(asc(seatRequestOptions.priority), asc(seatRequestOptions.createdAt)),
  ])
  // 每次打開看板都要把過期的候選結束掉（全部過期又沒訂到的需求會自動取消）。
  // 為了快，過期處理和讀資料同時跑；大部分時候沒有東西過期，有的話才再讀一次
  const [expiredCount, first] = await Promise.all([expirePastOptions(), readAll()])
  const [allRows, options] = expiredCount > 0 ? await readAll() : first
  const rows = allRows.filter((r) => r.request.status !== 'completed')

  const pendingIds = new Set(rows.filter((r) => r.request.status === 'pending').map((r) => r.request.id))
  const waiting = options.filter((o) => o.status === 'pending' && pendingIds.has(o.requestId))
  const stock = await findStock(waiting)

  return NextResponse.json(rows.map(({ request, createdByName }) => ({
    ...request,
    createdByName,
    options: options
      .filter((o) => o.requestId === request.id)
      .map((o) => ({
        ...o,
        stockMatches: o.status === 'pending' && request.status === 'pending'
          ? stock.filter((b) => matchesStock(o, b))
          : [],
      })),
  })))
}

type OptionInput = { branchId?: string; branch?: string; bookingDate?: string; timeSlot?: string; partySize?: string | number }

// 登記訂位需求：客服／管理員。options 依順位排，第一個是客人最想要的
export async function POST(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const inputs: OptionInput[] = Array.isArray(body.options) ? body.options : []
  if (inputs.length === 0) return NextResponse.json({ error: '至少要填一個候選日期' }, { status: 400 })

  const resolved = []
  for (const [i, o] of inputs.entries()) {
    const r = await resolveBranch({ branchId: o.branchId, branch: o.branch })
    if (!r.branchId) return NextResponse.json({ error: `第 ${i + 1} 順位請選擇餐廳和分店` }, { status: 400 })
    if (!o.bookingDate) return NextResponse.json({ error: `第 ${i + 1} 順位請填日期` }, { status: 400 })
    if (!o.timeSlot) return NextResponse.json({ error: `第 ${i + 1} 順位請選餐期` }, { status: 400 })
    if (o.bookingDate <= taipeiToday()) return NextResponse.json({ error: `第 ${i + 1} 順位的日期是今天或已經過了，要從明天以後` }, { status: 400 })
    resolved.push({ priority: i + 1, branchId: r.branchId, branch: r.branch, bookingDate: o.bookingDate, timeSlot: o.timeSlot || null, partySize: o.partySize ? Number(o.partySize) || null : null })
  }

  const [row] = await db.insert(seatRequests).values({
    customerName: body.customerName || null,
    customerPhone: body.customerPhone || null,
    note: body.note || null,
    createdById: session.user.id,
  }).returning()

  // neon-http 沒有交易，候選寫失敗就把剛建的需求刪掉，不留沒有候選的空需求
  try {
    await db.insert(seatRequestOptions).values(resolved.map((o) => ({ ...o, requestId: row.id })))
  } catch (err) {
    await db.delete(seatRequests).where(eq(seatRequests.id, row.id))
    throw err
  }

  return NextResponse.json(row, { status: 201 })
}
