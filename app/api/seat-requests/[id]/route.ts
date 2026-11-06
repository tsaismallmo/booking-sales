import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequestOptions, seatRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { resolveBranch } from '@/lib/branches'
import { refreshRequestStatus } from '@/lib/seat-requests'

// 整筆訂位需求的處理（個別候選日期的已訂到／訂不到在 /api/seat-requests/options/[id]）：
//   edit（修改客人資料、候選日期、順位）：三種角色都可以
//   cancelled（客人不要了）：客服／管理員
//   finish（剩下還沒訂的候選不訂了，結束這筆需求）：三種角色都可以
//   reopen（改回待訂位，被跳過的候選也恢復待訂）：三種角色都可以，按錯時用
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('customer_service', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const roles = session.user.roles
  const canCancel = roles.includes('customer_service') || roles.includes('admin')

  const { id } = await params
  const [existing] = await db.select().from(seatRequests).where(eq(seatRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const handled = { handledById: session.user.id, handledByName: body.handledByName || session.user.name || null, handledAt: new Date() }

  if (body.action === 'edit') {
    // 修改客人資料和候選日期。options 是修改後的完整清單（依順位排）：
    //   有 id 的是原本的候選——還沒處理的可以改分店／日期／時段，已處理的（訂到／訂不到／不訂了）只改順位；
    //   沒有 id 的是新加的候選；原本有但清單裡沒有的，還沒處理的刪掉，已處理的保留排在最後
    if (existing.status === 'cancelled') return NextResponse.json({ error: '已取消的需求請先改回待訂位再修改' }, { status: 400 })
    const inputs: { id?: string; branchId?: string; branch?: string; bookingDate?: string; timeSlot?: string; partySize?: string | number }[] = Array.isArray(body.options) ? body.options : []
    const current = await db.select().from(seatRequestOptions).where(eq(seatRequestOptions.requestId, id))
    const byId = new Map(current.map((o) => [o.id, o]))

    type Plan = { kind: 'update'; id: string; values: Partial<typeof seatRequestOptions.$inferInsert> } | { kind: 'insert'; values: typeof seatRequestOptions.$inferInsert }
    const plans: Plan[] = []
    for (const [i, o] of inputs.entries()) {
      const priority = i + 1
      const old = o.id ? byId.get(o.id) : undefined
      if (old && old.status !== 'pending') {
        plans.push({ kind: 'update', id: old.id, values: { priority } })
        continue
      }
      const r = await resolveBranch({ branchId: o.branchId, branch: o.branch })
      if (!r.branchId) return NextResponse.json({ error: `第 ${priority} 順位請選擇餐廳和分店` }, { status: 400 })
      if (!o.bookingDate) return NextResponse.json({ error: `第 ${priority} 順位請填日期` }, { status: 400 })
      const values = { priority, branchId: r.branchId, branch: r.branch, bookingDate: o.bookingDate, timeSlot: o.timeSlot || null, partySize: o.partySize ? Number(o.partySize) || null : null }
      plans.push(old ? { kind: 'update', id: old.id, values } : { kind: 'insert', values: { ...values, requestId: id } })
    }
    const kept = new Set(inputs.map((o) => o.id).filter(Boolean))
    const missing = current.filter((o) => !kept.has(o.id))
    const keepHandled = missing.filter((o) => o.status !== 'pending')
    if (plans.length + keepHandled.length === 0) return NextResponse.json({ error: '至少要有一個候選日期' }, { status: 400 })

    for (const p of plans) {
      if (p.kind === 'update') await db.update(seatRequestOptions).set(p.values).where(eq(seatRequestOptions.id, p.id))
      else await db.insert(seatRequestOptions).values(p.values)
    }
    for (const [i, o] of keepHandled.entries()) {
      await db.update(seatRequestOptions).set({ priority: plans.length + i + 1 }).where(eq(seatRequestOptions.id, o.id))
    }
    for (const o of missing.filter((o) => o.status === 'pending')) {
      await db.delete(seatRequestOptions).where(eq(seatRequestOptions.id, o.id))
    }
    await db.update(seatRequests).set({
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      note: body.note || null,
    }).where(eq(seatRequests.id, id))
    // 已結束的需求加了新的候選，會自動回到待訂位
    await refreshRequestStatus(id)
  } else if (body.action === 'cancelled') {
    if (!canCancel) return NextResponse.json({ error: '只有客服或管理員能取消' }, { status: 403 })
    await db.update(seatRequests).set({ status: 'cancelled', resultNote: body.resultNote || existing.resultNote, ...handled }).where(eq(seatRequests.id, id))
  } else if (body.action === 'finish') {
    await db.update(seatRequestOptions).set({ status: 'skipped', ...handled })
      .where(and(eq(seatRequestOptions.requestId, id), eq(seatRequestOptions.status, 'pending')))
    await db.update(seatRequests).set({ resultNote: body.resultNote || existing.resultNote, ...handled }).where(eq(seatRequests.id, id))
    await refreshRequestStatus(id)
  } else if (body.action === 'reopen') {
    await db.update(seatRequestOptions).set({ status: 'pending', handledById: null, handledByName: null, handledAt: null })
      .where(and(eq(seatRequestOptions.requestId, id), eq(seatRequestOptions.status, 'skipped')))
    await db.update(seatRequests).set({ status: 'pending', handledById: null, handledByName: null, handledAt: null }).where(eq(seatRequests.id, id))
    await refreshRequestStatus(id)
  } else {
    return NextResponse.json({ error: '不認得的動作' }, { status: 400 })
  }

  const [row] = await db.select().from(seatRequests).where(eq(seatRequests.id, id))
  return NextResponse.json(row)
}

// 刪除訂位需求：只有已取消的才能刪（客服／管理員），候選日期會跟著一起刪
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: '只有客服或管理員能刪除' }, { status: 403 })

  const { id } = await params
  const [existing] = await db.select({ status: seatRequests.status }).from(seatRequests).where(eq(seatRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (existing.status !== 'cancelled') return NextResponse.json({ error: '只有已取消的需求可以刪除' }, { status: 400 })

  await db.delete(seatRequests).where(eq(seatRequests.id, id))
  return NextResponse.json({ ok: true })
}
