import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branchAliases } from '@/lib/db/schema'
import { auth } from '@/auth'

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
  if (!body.rawText || !body.canonicalBranch) {
    return NextResponse.json({ error: '缺少 rawText 或 canonicalBranch' }, { status: 400 })
  }

  const [row] = await db
    .insert(branchAliases)
    .values({ rawText: body.rawText, canonicalBranch: body.canonicalBranch })
    .onConflictDoUpdate({ target: branchAliases.rawText, set: { canonicalBranch: body.canonicalBranch } })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
