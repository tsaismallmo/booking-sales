import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorStaffOptions } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorWriteScope } from '@/lib/vendor-scope'

async function getOwned(id: string) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const vendorId = await vendorWriteScope(session)
  const [row] = await db.select().from(vendorStaffOptions).where(eq(vendorStaffOptions.id, id))
  if (!row || row.vendorId !== vendorId) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  return { row }
}

// 改名（{ name }）或調整順序（{ move: "up" | "down" }）。改名不會動到已經存在單據上的舊名稱
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { row, error } = await getOwned(id)
  if (error) return error
  const body = await req.json()

  if (body.move === 'up' || body.move === 'down') {
    const siblings = await db.select().from(vendorStaffOptions)
      .where(and(eq(vendorStaffOptions.vendorId, row.vendorId), eq(vendorStaffOptions.kind, row.kind)))
      .orderBy(asc(vendorStaffOptions.sortOrder), asc(vendorStaffOptions.createdAt))
    const i = siblings.findIndex((s) => s.id === id)
    const j = body.move === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= siblings.length) return NextResponse.json({ ok: true })
    const order = siblings.map((s) => s.id)
    ;[order[i], order[j]] = [order[j], order[i]]
    for (const [idx, sid] of order.entries()) await db.update(vendorStaffOptions).set({ sortOrder: idx }).where(eq(vendorStaffOptions.id, sid))
    return NextResponse.json({ ok: true })
  }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '請填名稱' }, { status: 400 })
  const dup = await db.select({ id: vendorStaffOptions.id }).from(vendorStaffOptions)
    .where(and(eq(vendorStaffOptions.vendorId, row.vendorId), eq(vendorStaffOptions.kind, row.kind), eq(vendorStaffOptions.name, name)))
  if (dup.some((d) => d.id !== id)) return NextResponse.json({ error: '已經有這個名稱' }, { status: 400 })
  const [updated] = await db.update(vendorStaffOptions).set({ name }).where(eq(vendorStaffOptions.id, id)).returning()
  return NextResponse.json(updated)
}

// 刪除選項：已經填在單據上的名稱不會被清掉
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await getOwned(id)
  if (error) return error
  await db.delete(vendorStaffOptions).where(eq(vendorStaffOptions.id, id))
  return NextResponse.json({ ok: true })
}
