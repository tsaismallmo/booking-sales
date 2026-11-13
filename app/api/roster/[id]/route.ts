import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorWriteScope } from '@/lib/vendor-scope'

async function getOwnedEntry(id: string, vendorId: string) {
  const [row] = await db
    .select()
    .from(vendorRosterEntries)
    .where(and(eq(vendorRosterEntries.id, id), eq(vendorRosterEntries.vendorId, vendorId)))
  return row ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await getOwnedEntry(id, (await vendorWriteScope(session)) ?? '')
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const [row] = await db
    .update(vendorRosterEntries)
    .set({
      name: body.name ?? existing.name,
      phone: body.phone ?? existing.phone,
      note: body.note ?? existing.note,
      groupId: body.groupId !== undefined ? (body.groupId || null) : existing.groupId,
    })
    .where(eq(vendorRosterEntries.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await getOwnedEntry(id, (await vendorWriteScope(session)) ?? '')
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await db.delete(vendorRosterEntries).where(eq(vendorRosterEntries.id, id))
  return NextResponse.json({ ok: true })
}
