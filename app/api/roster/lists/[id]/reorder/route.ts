import { NextRequest, NextResponse } from 'next/server'
import { eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 跟前一份／後一份名單交換排序
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('vendor')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const direction: 'up' | 'down' = body.direction
  if (direction !== 'up' && direction !== 'down') return NextResponse.json({ error: '缺少方向' }, { status: 400 })

  const lists = await db.select().from(vendorRosterLists).where(eq(vendorRosterLists.vendorId, session.user.id)).orderBy(asc(vendorRosterLists.sortOrder))
  const idx = lists.findIndex((l) => l.id === id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= lists.length) return NextResponse.json({ ok: true }) // 已經是第一個/最後一個，不用動

  const a = lists[idx]
  const b = lists[swapIdx]
  await db.update(vendorRosterLists).set({ sortOrder: b.sortOrder }).where(eq(vendorRosterLists.id, a.id))
  await db.update(vendorRosterLists).set({ sortOrder: a.sortOrder }).where(eq(vendorRosterLists.id, b.id))

  return NextResponse.json({ ok: true })
}
