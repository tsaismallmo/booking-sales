import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequestOptions, seatRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { refreshRequestStatus } from '@/lib/seat-requests'

// 處理單一候選日期：
//   booked（已訂到，要填訂位代號）／failed（訂不到，要寫原因）：後勤／管理員
//     booked 時 closeOthers=true 會把同一筆需求其他還沒訂的候選一起結束；
//     客人有時要訂多天，所以要不要結束由處理的人自己決定
//   reopen（改回待訂位）：三種角色都可以，按錯時用
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('customer_service', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const roles = session.user.roles
  const canHandle = roles.includes('logistics') || roles.includes('admin')

  const { id } = await params
  const [existing] = await db.select().from(seatRequestOptions).where(eq(seatRequestOptions.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [request] = await db.select({ status: seatRequests.status }).from(seatRequests).where(eq(seatRequests.id, existing.requestId))
  if (request?.status === 'cancelled') return NextResponse.json({ error: '這筆需求已取消，請先改回待訂位' }, { status: 400 })

  const body = await req.json()
  const handled = { handledById: session.user.id, handledByName: body.handledByName || session.user.name || null, handledAt: new Date() }

  let patch: Partial<typeof seatRequestOptions.$inferInsert>
  if (body.action === 'booked') {
    if (!canHandle) return NextResponse.json({ error: '只有後勤或管理員能處理' }, { status: 403 })
    if (!body.bookingCode?.trim()) return NextResponse.json({ error: '請填訂位代號' }, { status: 400 })
    patch = { status: 'booked', bookingCode: body.bookingCode.trim(), resultNote: body.resultNote || null, ...handled }
  } else if (body.action === 'failed') {
    if (!canHandle) return NextResponse.json({ error: '只有後勤或管理員能處理' }, { status: 403 })
    if (!body.resultNote?.trim()) return NextResponse.json({ error: '請寫訂不到的原因' }, { status: 400 })
    patch = { status: 'failed', bookingCode: null, resultNote: body.resultNote.trim(), ...handled }
  } else if (body.action === 'reopen') {
    patch = { status: 'pending', bookingCode: null, resultNote: null, handledById: null, handledByName: null, handledAt: null }
  } else {
    return NextResponse.json({ error: '不認得的動作' }, { status: 400 })
  }

  const [row] = await db.update(seatRequestOptions).set(patch).where(eq(seatRequestOptions.id, id)).returning()
  if (body.action === 'booked' && body.closeOthers) {
    await db.update(seatRequestOptions).set({ status: 'skipped', ...handled })
      .where(and(eq(seatRequestOptions.requestId, existing.requestId), eq(seatRequestOptions.status, 'pending'), ne(seatRequestOptions.id, id)))
  }
  await refreshRequestStatus(existing.requestId)
  return NextResponse.json(row)
}
