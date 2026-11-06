import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { branches } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { listBranchOptions } from '@/lib/branches'

// 分店下拉選單用：登入的人都能查。預設只列啟用中的；管理頁帶 ?all=1 連停用的一起列
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const all = req.nextUrl.searchParams.get('all') === '1' && session.user.roles.includes('admin')
  const opts = await listBranchOptions()
  return NextResponse.json(all ? opts : opts.filter((o) => o.active))
}

// 新增分店：只有管理員
export async function POST(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!body.restaurantId || !name) return NextResponse.json({ error: '缺少餐廳或分店名稱' }, { status: 400 })
  if (name.includes('｜')) return NextResponse.json({ error: '分店名稱不能有「｜」' }, { status: 400 })

  const [row] = await db.insert(branches).values({ restaurantId: body.restaurantId, name }).onConflictDoNothing().returning()
  if (!row) return NextResponse.json({ error: '這間餐廳已經有同名的分店' }, { status: 409 })
  return NextResponse.json(row, { status: 201 })
}
