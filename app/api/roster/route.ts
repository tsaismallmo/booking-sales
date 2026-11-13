import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope, scopeEq, vendorWriteScope } from '@/lib/vendor-scope'

// 廠商看自己的名單；廠商員工只能看（不能改）自己所屬廠商的名單
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = await vendorScope(session)
  if (!ownerId) return NextResponse.json([])

  const listId = req.nextUrl.searchParams.get('listId')

  const rows = listId
    ? await db.select().from(vendorRosterEntries).where(and(scopeEq(vendorRosterEntries.vendorId, ownerId), eq(vendorRosterEntries.listId, listId)))
    : await db.select().from(vendorRosterEntries).where(scopeEq(vendorRosterEntries.vendorId, ownerId))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const vendorId = await vendorWriteScope(session)
  if (!vendorId) return NextResponse.json({ error: '請先選擇要代理的廠商' }, { status: 400 })

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '缺少姓名' }, { status: 400 })
  if (!body.listId) return NextResponse.json({ error: '缺少名單' }, { status: 400 })

  const [list] = await db
    .select()
    .from(vendorRosterLists)
    .where(and(eq(vendorRosterLists.id, body.listId), eq(vendorRosterLists.vendorId, vendorId)))
  if (!list) return NextResponse.json({ error: '找不到這份名單' }, { status: 404 })

  const [row] = await db
    .insert(vendorRosterEntries)
    .values({
      vendorId,
      listId: body.listId,
      name: body.name,
      phone: body.phone || null,
      note: body.note || null,
      groupId: body.groupId || null, // 這個名字是在哪個集團登記的；空的＝所有集團都適用
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
