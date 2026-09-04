import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 廠商名單只有廠商自己能用，只看得到自己的名單
export async function GET() {
  const session = await requireRole('vendor')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const rows = await db.select().from(vendorRosterEntries).where(eq(vendorRosterEntries.vendorId, session.user.id))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await requireRole('vendor')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '缺少姓名' }, { status: 400 })

  const [row] = await db
    .insert(vendorRosterEntries)
    .values({
      vendorId: session.user.id,
      name: body.name,
      phone: body.phone || null,
      note: body.note || null,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
