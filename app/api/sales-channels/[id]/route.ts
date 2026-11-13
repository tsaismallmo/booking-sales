import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { salesChannels } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 修改銷售平台的名稱、基本 %：管理員
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const patch: Partial<typeof salesChannels.$inferInsert> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: '請填平台名稱' }, { status: 400 })
    const [dup] = await db.select({ id: salesChannels.id }).from(salesChannels).where(and(eq(salesChannels.name, name), ne(salesChannels.id, id)))
    if (dup) return NextResponse.json({ error: '已經有這個平台' }, { status: 400 })
    patch.name = name
  }
  if (body.baseRate !== undefined) {
    const baseRate = Number(body.baseRate)
    if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > 100) return NextResponse.json({ error: '基本 % 要在 0–100 之間' }, { status: 400 })
    patch.baseRate = String(baseRate)
  }
  const [row] = await db.update(salesChannels).set(patch).where(eq(salesChannels.id, id)).returning()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(row)
}
