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

  if (!Array.isArray(body.roles) || body.roles.length === 0) {
    return NextResponse.json({ error: '至少要有一個角色' }, { status: 400 })
  }
  if (id === session.user.id && !body.roles.includes('admin')) {
    return NextResponse.json({ error: '不能移除自己的管理員角色，避免把自己鎖在外面' }, { status: 400 })
  }

  const [row] = await db
    .update(users)
    .set({
      name: body.name,
      roles: body.roles,
      employerVendorId: body.roles.includes('vendor_staff') ? body.employerVendorId || null : null,
    })
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
