import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterLists, vendorRosterEntries } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

async function getOwnedList(id: string, vendorId: string) {
  const [row] = await db
    .select()
    .from(vendorRosterLists)
    .where(and(eq(vendorRosterLists.id, id), eq(vendorRosterLists.vendorId, vendorId)))
  return row ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('vendor')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await getOwnedList(id, session.user.id)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const [row] = await db
    .update(vendorRosterLists)
    .set({
      name: body.name ?? existing.name,
      ownerEmail: body.ownerEmail === undefined ? existing.ownerEmail : (body.ownerEmail || null),
    })
    .where(eq(vendorRosterLists.id, id))
    .returning()

  return NextResponse.json(row)
}

// 刪除名單會連同名單裡的成員一起刪掉
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('vendor')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await getOwnedList(id, session.user.id)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await db.delete(vendorRosterEntries).where(eq(vendorRosterEntries.listId, id))
  await db.delete(vendorRosterLists).where(eq(vendorRosterLists.id, id))
  return NextResponse.json({ ok: true })
}
