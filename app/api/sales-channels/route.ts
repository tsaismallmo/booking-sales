import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { salesChannels } from '@/lib/db/schema'
import { auth } from '@/auth'
import { requireRole } from '@/lib/auth-guard'
import { listSalesChannels } from '@/lib/platform-settings'

// 銷售平台清單：單據表單的下拉要用，登入的人都能讀
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listSalesChannels())
}

// 新增銷售平台：管理員
export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const name = String(body.name ?? '').trim()
  const baseRate = Number(body.baseRate)
  if (!name) return NextResponse.json({ error: '請填平台名稱' }, { status: 400 })
  if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > 100) return NextResponse.json({ error: '基本 % 要在 0–100 之間' }, { status: 400 })
  const existing = await listSalesChannels()
  if (existing.some((c) => c.name === name)) return NextResponse.json({ error: '已經有這個平台' }, { status: 400 })
  const [row] = await db.insert(salesChannels).values({ name, baseRate: String(baseRate), sortOrder: existing.length }).returning()
  return NextResponse.json(row, { status: 201 })
}
