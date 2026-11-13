import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorStaffOptions } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorWriteScope } from '@/lib/vendor-scope'

const KINDS = ['booker', 'payer'] as const
type Kind = (typeof KINDS)[number]
const asKind = (v: unknown): Kind | null => (KINDS.includes(v as Kind) ? (v as Kind) : null)

// 人員選項（實際訂位人員 kind=booker／付款人員 kind=payer）
//   一般（單據表單的下拉）：管理員 → 全部廠商的選項（附廠商名稱，前端依廠商分組）；廠商 → 自己的；廠商員工 → 所屬廠商的
//   manage=1（人員選項設定頁）：只回目前要管理的那個廠商（管理員＝側邊欄代理的廠商）
export async function GET(req: NextRequest) {
  const session = await requireRole('admin', 'vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const kind = asKind(req.nextUrl.searchParams.get('kind'))
  const manage = req.nextUrl.searchParams.get('manage') === '1'
  const roles = session.user.roles

  let vendorId: string | null | 'all'
  if (manage) vendorId = await vendorWriteScope(session)
  else vendorId = roles.includes('admin') ? 'all' : roles.includes('vendor') ? session.user.id : session.user.employerVendorId ?? null
  if (!vendorId) return NextResponse.json([])

  const conds = [
    ...(vendorId === 'all' ? [] : [eq(vendorStaffOptions.vendorId, vendorId)]),
    ...(kind ? [eq(vendorStaffOptions.kind, kind)] : []),
  ]
  const rows = await db
    .select({ id: vendorStaffOptions.id, kind: vendorStaffOptions.kind, name: vendorStaffOptions.name, vendorId: vendorStaffOptions.vendorId, vendorName: users.name, vendorEmail: users.email, sortOrder: vendorStaffOptions.sortOrder })
    .from(vendorStaffOptions)
    .innerJoin(users, eq(vendorStaffOptions.vendorId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(users.name), asc(vendorStaffOptions.kind), asc(vendorStaffOptions.sortOrder), asc(vendorStaffOptions.createdAt))
  return NextResponse.json(rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, vendorId: r.vendorId, vendorName: r.vendorName ?? r.vendorEmail })))
}

// 新增選項：廠商本人或管理員（代理廠商）
export async function POST(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const vendorId = await vendorWriteScope(session)
  if (!vendorId) return NextResponse.json({ error: '請先選擇要代理的廠商' }, { status: 400 })
  const body = await req.json()
  const kind = asKind(body.kind)
  const name = String(body.name ?? '').trim()
  if (!kind) return NextResponse.json({ error: '缺少種類' }, { status: 400 })
  if (!name) return NextResponse.json({ error: '請填名稱' }, { status: 400 })
  const existing = await db.select().from(vendorStaffOptions).where(and(eq(vendorStaffOptions.vendorId, vendorId), eq(vendorStaffOptions.kind, kind)))
  if (existing.some((o) => o.name === name)) return NextResponse.json({ error: '已經有這個名稱' }, { status: 400 })
  const sortOrder = existing.reduce((m, o) => Math.max(m, o.sortOrder), -1) + 1
  const [row] = await db.insert(vendorStaffOptions).values({ vendorId, kind, name, sortOrder }).returning()
  return NextResponse.json(row, { status: 201 })
}
