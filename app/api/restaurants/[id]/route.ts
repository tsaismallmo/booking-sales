import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { restaurants } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { branchIdsOfRestaurant, syncBranchTexts } from '@/lib/branches'

// 修改餐廳（改名、停用/啟用、排序）：只有管理員。不提供刪除，只能停用（停用後底下分店都不會出現在選單）。
// 改名後底下所有分店的單據／簡訊對應文字會一起更新
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id))
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const name = body.name === undefined ? existing.name : String(body.name).trim()
  if (!name) return NextResponse.json({ error: '餐廳名稱不能空白' }, { status: 400 })
  if (name.includes('｜')) return NextResponse.json({ error: '餐廳名稱不能有「｜」' }, { status: 400 })

  const [dup] = await db.select({ id: restaurants.id }).from(restaurants).where(and(eq(restaurants.name, name), ne(restaurants.id, id)))
  if (dup) return NextResponse.json({ error: '已經有同名的餐廳' }, { status: 409 })

  const [row] = await db.update(restaurants).set({
    name,
    active: body.active ?? existing.active,
    cancelDaysBefore: body.cancelDaysBefore !== undefined ? Math.max(0, Math.floor(Number(body.cancelDaysBefore)) || 0) : existing.cancelDaysBefore,
    sortOrder: body.sortOrder ?? existing.sortOrder,
  }).where(eq(restaurants.id, id)).returning()

  if (name !== existing.name) await syncBranchTexts(await branchIdsOfRestaurant(id))
  return NextResponse.json(row)
}
