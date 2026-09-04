import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendorRosterEntries, vendorRosterLists } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

// 查詢電話是否已經存在於（同一個廠商底下）其他名單裡，避免重複建立
export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'vendor_staff')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: '缺少 phone' }, { status: 400 })

  const ownerId = session.user.roles.includes('vendor') ? session.user.id : session.user.employerVendorId
  if (!ownerId) return NextResponse.json([])

  const rows = await db
    .select({ entryId: vendorRosterEntries.id, name: vendorRosterEntries.name, listId: vendorRosterEntries.listId, listName: vendorRosterLists.name })
    .from(vendorRosterEntries)
    .innerJoin(vendorRosterLists, eq(vendorRosterEntries.listId, vendorRosterLists.id))
    .where(and(eq(vendorRosterEntries.vendorId, ownerId), eq(vendorRosterEntries.phone, phone)))

  return NextResponse.json(rows)
}
