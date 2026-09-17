import { NextRequest, NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { backups, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { snapshotAllTables } from '@/lib/backup'

export async function GET() {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const rows = await db
    .select({ id: backups.id, label: backups.label, createdAt: backups.createdAt, createdById: backups.createdById })
    .from(backups)
    .orderBy(desc(backups.createdAt))

  const creatorIds = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))]
  const creators = creatorIds.length > 0 ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users) : []
  const creatorMap = new Map(creators.map((c) => [c.id, c.name || c.email]))

  return NextResponse.json(rows.map((r) => ({ ...r, createdByName: r.createdById ? creatorMap.get(r.createdById) ?? null : null })))
}

export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const data = await snapshotAllTables()

  const [row] = await db
    .insert(backups)
    .values({ label: body.label || null, data, createdById: session.user.id })
    .returning({ id: backups.id, label: backups.label, createdAt: backups.createdAt })

  return NextResponse.json(row, { status: 201 })
}
