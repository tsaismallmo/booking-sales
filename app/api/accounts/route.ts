import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

export async function GET() {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const rows = await db.select().from(users)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.email || !Array.isArray(body.roles) || body.roles.length === 0) {
    return NextResponse.json({ error: '缺少 email 或至少一個角色' }, { status: 400 })
  }

  const [row] = await db
    .insert(users)
    .values({
      email: body.email,
      name: body.name || null,
      roles: body.roles,
      employerVendorId: body.roles.includes('vendor_staff') ? body.employerVendorId || null : null,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
