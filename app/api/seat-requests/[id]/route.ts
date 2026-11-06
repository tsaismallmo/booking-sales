import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequestOptions, seatRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { refreshRequestStatus } from '@/lib/seat-requests'

// 整筆訂位需求的處理（個別候選日期的已訂到／訂不到在 /api/seat-requests/options/[id]）：
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

  if (body.action === 'cancelled') {
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
