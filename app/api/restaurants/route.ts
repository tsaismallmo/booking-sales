import { NextRequest, NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { restaurants } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 餐廳主檔：只有管理員能看／維護（一般人選分店走 /api/branches，裡面已經帶餐廳名稱）
export async function GET() {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const rows = await db.select().from(restaurants).orderBy(asc(restaurants.sortOrder), asc(restaurants.name))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '缺少餐廳名稱' }, { status: 400 })
  if (name.includes('｜')) return NextResponse.json({ error: '餐廳名稱不能有「｜」' }, { status: 400 })

  const cancelDaysBefore = body.cancelDaysBefore !== undefined ? Math.max(0, Math.floor(Number(body.cancelDaysBefore)) || 0) : 7
  const [row] = await db.insert(restaurants).values({ name, cancelDaysBefore }).onConflictDoNothing().returning()
  if (!row) return NextResponse.json({ error: '已經有同名的餐廳' }, { status: 409 })
  return NextResponse.json(row, { status: 201 })
}
