import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { restaurantGroups } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 集團改名：管理員（不提供刪除，餐廳和名單成員都指著它）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const name = String((await req.json()).name ?? '').trim()
  if (!name) return NextResponse.json({ error: '請填集團名稱' }, { status: 400 })
  const [dup] = await db.select({ id: restaurantGroups.id }).from(restaurantGroups).where(and(eq(restaurantGroups.name, name), ne(restaurantGroups.id, id)))
  if (dup) return NextResponse.json({ error: '已經有這個集團' }, { status: 409 })
  const [row] = await db.update(restaurantGroups).set({ name }).where(eq(restaurantGroups.id, id)).returning()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(row)
}
