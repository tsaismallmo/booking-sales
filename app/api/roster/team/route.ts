import { NextResponse } from 'next/server'
import { or, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope } from '@/lib/vendor-scope'

// 廠商本人 + 所屬廠商員工的帳號清單，給「帳號歸屬」下拉選單用
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = await vendorScope(session)
  if (!ownerId || ownerId === 'all') return NextResponse.json([])

  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(or(eq(users.id, ownerId), eq(users.employerVendorId, ownerId)))

  return NextResponse.json(rows)
}
