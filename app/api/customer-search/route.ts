import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope, scopeEq } from '@/lib/vendor-scope'
import { groupIdOfBranch } from '@/lib/branches'

// 模糊搜尋客人（姓名 + 電話），供「解析簡訊」頁面的客人選擇器用。
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) return NextResponse.json([])

  const ownerId = await vendorScope(session)
  if (!ownerId) return NextResponse.json([])
  // 帶了分店就只看那間餐廳所屬集團的名單成員（沒標集團的所有集團都適用）
  const groupId = await groupIdOfBranch({ branchId: req.nextUrl.searchParams.get('branchId'), branch: req.nextUrl.searchParams.get('branch') })

  const rosterRows = await db
    .select({ name: vendorRosterEntries.name, phone: vendorRosterEntries.phone, listName: vendorRosterLists.name, bookerName: sql<string>`coalesce(${users.name}, ${vendorRosterLists.name})` })
    .from(vendorRosterEntries)
    .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
    .leftJoin(users, sql`lower(${users.email}) = lower(${vendorRosterLists.ownerEmail})`)
    .where(and(
      scopeEq(vendorRosterEntries.vendorId, ownerId),
      (groupId ? or(isNull(vendorRosterEntries.groupId), eq(vendorRosterEntries.groupId, groupId)) : undefined),
      ilike(vendorRosterEntries.name, `%${q}%`),
    ))
    .limit(20)

  // bookerName：名單擁有者的帳號姓名（沒設定擁有者就用名單名稱），前端帶入「實際訂位人員」
  type Result = { name: string; phone: string; source: 'roster'; label: string; bookerName: string }
  const seen = new Set<string>()
  const results: Result[] = []

  for (const r of rosterRows) {
    if (!r.name || !r.phone) continue
    const key = `${r.name}::${r.phone.replace(/\D/g, '')}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ name: r.name, phone: r.phone, source: 'roster', label: r.listName, bookerName: r.bookerName })
  }

  return NextResponse.json(results.slice(0, 20))
}
