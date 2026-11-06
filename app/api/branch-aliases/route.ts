import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branchAliases } from '@/lib/db/schema'
import { auth } from '@/auth'
import { resolveBranch } from '@/lib/branches'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rawText = req.nextUrl.searchParams.get('rawText')

  // 沒帶 rawText = 列出全部，給管理頁用，只有管理員能看
  if (!rawText) {
    if (!session.user.roles.includes('admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const rows = await db.select().from(branchAliases).orderBy(desc(branchAliases.createdAt))
    return NextResponse.json(rows)
  }

  const [row] = await db.select().from(branchAliases).where(eq(branchAliases.rawText, rawText))
  return NextResponse.json(row ?? null)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.rawText || (!body.canonicalBranch && !body.branchId)) {
    return NextResponse.json({ error: '缺少 rawText 或分店' }, { status: 400 })
  }
  // 對應到分店主檔：有 branchId 就照主檔，只有文字就盡量對回主檔
  const resolved = await resolveBranch({ branchId: body.branchId, branch: body.canonicalBranch })
  if (!resolved.branch) return NextResponse.json({ error: '缺少分店' }, { status: 400 })

  const [row] = await db
    .insert(branchAliases)
    .values({ rawText: body.rawText, branchId: resolved.branchId, canonicalBranch: resolved.branch })
    .onConflictDoUpdate({ target: branchAliases.rawText, set: { branchId: resolved.branchId, canonicalBranch: resolved.branch } })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
