import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { syncBranchTexts } from '@/lib/branches'

// 修改分店（改名、換餐廳、停用/啟用、排序）：只有管理員。不提供刪除，只能停用。
// 改名或換餐廳後，指到這間分店的單據／簡訊對應文字會一起更新
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const [existing] = await db.select().from(branches).where(eq(branches.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const name = body.name === undefined ? existing.name : String(body.name).trim()
  const restaurantId = body.restaurantId ?? existing.restaurantId
  if (!name) return NextResponse.json({ error: '分店名稱不能空白' }, { status: 400 })
  if (name.includes('｜')) return NextResponse.json({ error: '分店名稱不能有「｜」' }, { status: 400 })

  const [dup] = await db.select({ id: branches.id }).from(branches)
    .where(and(eq(branches.restaurantId, restaurantId), eq(branches.name, name), ne(branches.id, id)))
  if (dup) return NextResponse.json({ error: '這間餐廳已經有同名的分店' }, { status: 409 })

  const [row] = await db.update(branches).set({
    name,
    restaurantId,
    active: body.active ?? existing.active,
    sortOrder: body.sortOrder ?? existing.sortOrder,
  }).where(eq(branches.id, id)).returning()

  if (name !== existing.name || restaurantId !== existing.restaurantId) await syncBranchTexts([id])
  return NextResponse.json(row)
}
