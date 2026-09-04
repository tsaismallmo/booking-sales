import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 廠商看自己的名單；廠商員工只能看（不能改）自己所屬廠商的名單
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const rows = await db.select().from(vendorRosterEntries).where(eq(vendorRosterEntries.vendorId, ownerId))
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
