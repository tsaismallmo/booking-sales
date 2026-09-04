import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branchAliases } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  if (!body.canonicalBranch) return NextResponse.json({ error: '缺少 canonicalBranch' }, { status: 400 })

  const [row] = await db
    .update(branchAliases)
    .set({ canonicalBranch: body.canonicalBranch })
    .where(eq(branchAliases.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  await db.delete(branchAliases).where(eq(branchAliases.id, id))
  return NextResponse.json({ ok: true })
}
