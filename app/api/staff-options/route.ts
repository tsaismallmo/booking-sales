import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 「實際訂位人員」「付款人員」下拉的選項：直接用帳號管理的帳號——廠商本人＋隸屬這個廠商的廠商員工（帳號上設定的所屬廠商）。
//   管理員 → 全部廠商（依廠商分組）；廠商 → 自己＋自己的員工；廠商員工 → 所屬廠商＋同廠商的員工
// 存進單據的是帳號姓名，跟「我訂的單據」、訂金付款看板用帳號姓名比對一致。
export async function GET() {
  const session = await requireRole('admin', 'vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const roles = session.user.roles

  const all = await db.select({ id: users.id, name: users.name, email: users.email, roles: users.roles, employerVendorId: users.employerVendorId }).from(users)
  const vendors = all.filter((u) => u.roles.includes('vendor'))
  const scopeVendorId = roles.includes('admin') ? null : roles.includes('vendor') ? session.user.id : session.user.employerVendorId ?? ''
  const inScope = vendors.filter((v) => scopeVendorId === null || v.id === scopeVendorId)

  const label = (u: { name: string | null; email: string }) => u.name || u.email
  const result = inScope
    .sort((a, b) => label(a).localeCompare(label(b), 'zh-Hant'))
    .flatMap((v) => {
      const staff = all
        .filter((u) => u.id !== v.id && u.roles.includes('vendor_staff') && u.employerVendorId === v.id)
        .sort((a, b) => label(a).localeCompare(label(b), 'zh-Hant'))
      return [v, ...staff].map((u) => ({ id: `${v.id}:${u.id}`, name: label(u), vendorId: v.id, vendorName: label(v) }))
    })
  return NextResponse.json(result)
}
