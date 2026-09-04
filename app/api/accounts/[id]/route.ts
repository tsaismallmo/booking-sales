import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const [row] = await db
    .update(users)
    .set({ name: body.name, role: body.role })
    .where(eq(users.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: '不能刪除自己的帳號' }, { status: 400 })
  }

  await db.delete(users).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}
