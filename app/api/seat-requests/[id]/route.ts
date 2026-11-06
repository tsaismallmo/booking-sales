import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequests } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 處理訂位需求：
//   booked（已訂到，要填訂位代號）／failed（訂不到，要寫原因）：後勤／管理員
//   cancelled（客人不要了）：客服／管理員
//   reopen（改回待訂位）：三種角色都可以，按錯時用
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('customer_service', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const roles = session.user.roles
  const canHandle = roles.includes('logistics') || roles.includes('admin')
  const canCancel = roles.includes('customer_service') || roles.includes('admin')

  const { id } = await params
  const [existing] = await db.select().from(seatRequests).where(eq(seatRequests.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const handled = { handledById: session.user.id, handledByName: body.handledByName || session.user.name || null, handledAt: new Date() }

  let patch: Partial<typeof seatRequests.$inferInsert>
  if (body.action === 'booked') {
    if (!canHandle) return NextResponse.json({ error: '只有後勤或管理員能處理' }, { status: 403 })
    if (!body.bookingCode?.trim()) return NextResponse.json({ error: '請填訂位代號' }, { status: 400 })
    patch = { status: 'booked', bookingCode: body.bookingCode.trim(), resultNote: body.resultNote || null, ...handled }
  } else if (body.action === 'failed') {
    if (!canHandle) return NextResponse.json({ error: '只有後勤或管理員能處理' }, { status: 403 })
    if (!body.resultNote?.trim()) return NextResponse.json({ error: '請寫訂不到的原因' }, { status: 400 })
    patch = { status: 'failed', resultNote: body.resultNote.trim(), ...handled }
  } else if (body.action === 'cancelled') {
    if (!canCancel) return NextResponse.json({ error: '只有客服或管理員能取消' }, { status: 403 })
    patch = { status: 'cancelled', resultNote: body.resultNote || existing.resultNote, ...handled }
  } else if (body.action === 'reopen') {
    patch = { status: 'pending', bookingCode: null, handledById: null, handledByName: null, handledAt: null }
  } else {
    return NextResponse.json({ error: '不認得的動作' }, { status: 400 })
  }

  const [row] = await db.update(seatRequests).set(patch).where(eq(seatRequests.id, id)).returning()
  return NextResponse.json(row)
}
