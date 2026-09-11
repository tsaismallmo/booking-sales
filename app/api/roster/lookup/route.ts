import { NextRequest, NextResponse } from 'next/server'
import { eq, and, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 查詢電話（可以一起帶姓名查）是列在（同一個廠商底下）哪些名單裡；
// 原本是新增名單時用來提醒「這支電話已經在其他名單裡」避免重複建立，
// 現在也拿來給單據詳情頁查「這通訂位電話是不是廠商名單裡的人」。
// 電話、姓名任一個有填就查，兩個都填的話符合任一個就會列出來（用 matchedBy 標示是配對到電話還是姓名）。
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const phone = req.nextUrl.searchParams.get('phone')
  const name = req.nextUrl.searchParams.get('name')
  if (!phone && !name) return NextResponse.json({ error: '缺少 phone 或 name' }, { status: 400 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const matchConditions = [
    phone ? eq(vendorRosterEntries.phone, phone) : null,
    name ? eq(vendorRosterEntries.name, name) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const rows = await db
    .select({ entryId: vendorRosterEntries.id, name: vendorRosterEntries.name, phone: vendorRosterEntries.phone, listId: vendorRosterEntries.listId, listName: vendorRosterLists.name })
    .from(vendorRosterEntries)
    .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
    .where(and(eq(vendorRosterEntries.vendorId, ownerId), or(...matchConditions)))

  return NextResponse.json(rows.map((r) => ({
    ...r,
    matchedBy: [phone && r.phone === phone ? 'phone' : null, name && r.name === name ? 'name' : null].filter(Boolean),
  })))
}
