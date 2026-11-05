import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 用訂位姓名查電話，給「解析簡訊」自動帶入訂位電話用（簡訊本身不含電話）。
// 來源：同一個廠商底下的廠商名單＋這個廠商以前建過的單據；同一支電話只列一次，名單優先。
// 例外：同一個名字出現在不同名單，就算電話一樣也各列一次——前端只有「剛好一筆」才自動帶入，
// 這樣同名出現在多份名單時不會自動填電話，要使用者自己確認是哪一位。
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) return NextResponse.json({ error: '缺少 name' }, { status: 400 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const [rosterRows, bookingRows] = await Promise.all([
    db
      .select({ phone: vendorRosterEntries.phone, listName: vendorRosterLists.name })
      .from(vendorRosterEntries)
      .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
      .where(and(eq(vendorRosterEntries.vendorId, ownerId), eq(vendorRosterEntries.name, name))),
    db
      .select({ phone: bookings.customerPhone, branch: bookings.branch, bookingDate: bookings.bookingDate })
      .from(bookings)
      .where(and(eq(bookings.vendorId, ownerId), eq(bookings.customerName, name), isNotNull(bookings.customerPhone)))
      .orderBy(desc(bookings.bookingDate))
      .limit(50),
  ])

  const seen = new Set<string>()
  const results: { phone: string; source: 'roster' | 'booking'; label: string }[] = []
  const add = (phone: string | null, source: 'roster' | 'booking', label: string) => {
    const digits = phone?.replace(/\D/g, '')
    if (!phone || !digits) return
    if (source === 'booking' && seen.has(digits)) return
    const key = source === 'roster' ? `${digits}::${label}` : digits
    if (seen.has(key)) return
    seen.add(key)
    seen.add(digits)
    results.push({ phone, source, label })
  }
  for (const r of rosterRows) add(r.phone, 'roster', `名單：${r.listName}`)
  for (const r of bookingRows) add(r.phone, 'booking', `單據：${r.bookingDate}${r.branch ? ` ${r.branch}` : ''}`)

  return NextResponse.json(results)
}
