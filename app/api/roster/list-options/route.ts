import { NextResponse } from 'next/server'
import { eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 「實際訂位人員」下拉選單用的名單名稱：
//   管理員 → 全部廠商的名單（附廠商名稱，前端依廠商分組）
//   廠商 → 自己底下的名單；廠商員工 → 所屬廠商底下的名單
export async function GET() {
  const session = await requireRole('admin', 'vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const roles = session.user.roles
  const ownerId = roles.includes('vendor') ? session.user.id : roles.includes('vendor_staff') ? session.user.employerVendorId : null
  if (!roles.includes('admin') && !ownerId) return NextResponse.json([])

  const query = db
    .select({ id: vendorRosterLists.id, name: vendorRosterLists.name, vendorId: vendorRosterLists.vendorId, vendorName: users.name, vendorEmail: users.email })
    .from(vendorRosterLists)
    .innerJoin(users, eq(vendorRosterLists.vendorId, users.id))
    .orderBy(asc(users.name), asc(vendorRosterLists.sortOrder))
  const rows = roles.includes('admin') ? await query : await query.where(eq(vendorRosterLists.vendorId, ownerId!))

  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, vendorId: r.vendorId, vendorName: r.vendorName ?? r.vendorEmail })))
}
