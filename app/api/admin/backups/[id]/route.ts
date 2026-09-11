import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { backups } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  await db.delete(backups).where(eq(backups.id, id))
  return NextResponse.json({ ok: true })
}
