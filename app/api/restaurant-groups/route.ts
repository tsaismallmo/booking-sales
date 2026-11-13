import { NextRequest, NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { restaurantGroups } from '@/lib/db/schema'
import { auth } from '@/auth'
import { requireRole } from '@/lib/auth-guard'

// 餐廳集團清單：廠商名單標集團時要用，登入的人都能讀
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await db.select().from(restaurantGroups).orderBy(asc(restaurantGroups.sortOrder), asc(restaurantGroups.createdAt)))
}

// 新增集團：管理員
export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const name = String((await req.json()).name ?? '').trim()
  if (!name) return NextResponse.json({ error: '請填集團名稱' }, { status: 400 })
  const existing = await db.select().from(restaurantGroups)
  if (existing.some((g) => g.name === name)) return NextResponse.json({ error: '已經有這個集團' }, { status: 409 })
  const [row] = await db.insert(restaurantGroups).values({ name, sortOrder: existing.length }).returning()
  return NextResponse.json(row, { status: 201 })
}
