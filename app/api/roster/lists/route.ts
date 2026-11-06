import { NextRequest, NextResponse } from 'next/server'
import { eq, asc, count } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterLists, vendorRosterEntries } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope, scopeEq, vendorWriteScope } from '@/lib/vendor-scope'

// 廠商員工能看到所屬廠商底下的全部名單（不分是誰建的）
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = await vendorScope(session)
  if (!ownerId) return NextResponse.json([])

  const lists = await db.select().from(vendorRosterLists).where(scopeEq(vendorRosterLists.vendorId, ownerId)).orderBy(asc(vendorRosterLists.sortOrder))
  const counts = await db
    .select({ listId: vendorRosterEntries.listId, entryCount: count() })
    .from(vendorRosterEntries)
    .where(scopeEq(vendorRosterEntries.vendorId, ownerId))
    .groupBy(vendorRosterEntries.listId)
  const countMap = new Map(counts.map((c) => [c.listId, c.entryCount]))

  return NextResponse.json(lists.map((l) => ({ ...l, entryCount: countMap.get(l.id) ?? 0 })))
}

// 廠商本人或管理員（代理廠商）能新增名單
export async function POST(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const vendorId = await vendorWriteScope(session)
  if (!vendorId) return NextResponse.json({ error: '請先選擇要代理的廠商' }, { status: 400 })

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '缺少名單名稱' }, { status: 400 })

  const existing = await db.select().from(vendorRosterLists).where(eq(vendorRosterLists.vendorId, vendorId))
  const maxOrder = existing.reduce((m, l) => Math.max(m, l.sortOrder), -1)

  const [row] = await db
    .insert(vendorRosterLists)
    .values({
      vendorId,
      name: body.name,
      ownerEmail: session.user.email ?? null,
      sortOrder: maxOrder + 1,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
