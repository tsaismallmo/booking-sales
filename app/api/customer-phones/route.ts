import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope, scopeEq } from '@/lib/vendor-scope'

// 用訂位姓名查電話，給「解析簡訊」自動帶入訂位電話用（簡訊本身不含電話）。
// 來源：同一個廠商底下的廠商名單＋這個廠商以前建過的單據；同一支電話只列一次，名單優先。
// 例外：同一個名字出現在不同名單，就算電話一樣也各列一次——前端只有「剛好一筆」才自動帶入，
// 這樣同名出現在多份名單時不會自動填電話，要使用者自己確認是哪一位。
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const name = req.nextUrl.searchParams.get('name')?.trim()
  const phoneDigits = req.nextUrl.searchParams.get('phone')?.replace(/\D/g, '')
  if (!name && !phoneDigits) return NextResponse.json({ error: '缺少 name 或 phone' }, { status: 400 })

  const ownerId = await vendorScope(session)
  if (!ownerId) return NextResponse.json([])

  // 已經知道電話（簡訊前面寫了「姓名/電話」）：只查這支電話在哪幾份名單，給前端帶「實際訂位人員」
  // （名單裡的電話可能有 - 或空白，去掉非數字再比）
  if (phoneDigits) {
    const rows = await db
      .selectDistinct({ phone: vendorRosterEntries.phone, listName: vendorRosterLists.name })
      .from(vendorRosterEntries)
      .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
      .where(and(scopeEq(vendorRosterEntries.vendorId, ownerId), sql`regexp_replace(${vendorRosterEntries.phone}, '\\D', '', 'g') = ${phoneDigits}`))
    return NextResponse.json(rows.map((r) => ({ phone: r.phone, source: 'roster', label: `名單：${r.listName}`, listName: r.listName })))
  }
  if (!name) return NextResponse.json([])

  const [rosterRows, bookingRows] = await Promise.all([
    db
      .select({ phone: vendorRosterEntries.phone, listName: vendorRosterLists.name })
      .from(vendorRosterEntries)
      .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
      .where(and(scopeEq(vendorRosterEntries.vendorId, ownerId), eq(vendorRosterEntries.name, name))),
    db
      .select({ phone: bookings.customerPhone, branch: bookings.branch, bookingDate: bookings.bookingDate })
      .from(bookings)
      .where(and(scopeEq(bookings.vendorId, ownerId), eq(bookings.customerName, name), isNotNull(bookings.customerPhone)))
      .orderBy(desc(bookings.bookingDate))
      .limit(50),
  ])

  const seen = new Set<string>()
  // listName：電話是從哪份名單查到的，前端拿來帶入「實際訂位人員」
  const results: { phone: string; source: 'roster' | 'booking'; label: string; listName: string | null }[] = []
  const add = (phone: string | null, source: 'roster' | 'booking', label: string, listName: string | null = null) => {
    const digits = phone?.replace(/\D/g, '')
    if (!phone || !digits) return
    if (source === 'booking' && seen.has(digits)) return
    const key = source === 'roster' ? `${digits}::${label}` : digits
    if (seen.has(key)) return
    seen.add(key)
    seen.add(digits)
    results.push({ phone, source, label, listName })
  }
  for (const r of rosterRows) add(r.phone, 'roster', `名單：${r.listName}`, r.listName)
  for (const r of bookingRows) add(r.phone, 'booking', `單據：${r.bookingDate}${r.branch ? ` ${r.branch}` : ''}`)

  return NextResponse.json(results)
}
