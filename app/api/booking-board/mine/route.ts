import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { vendorScope, scopeEq } from '@/lib/vendor-scope'

// 廠商（廠商員工則是所屬廠商）自己的全部訂位，
// 給月曆分頁做「可訂位名單」比對跟「當天訂位明細」用
export async function GET() {
  const session = await requireRole('vendor', 'vendor_staff', 'admin', 'logistics')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const ownerId = await vendorScope(session)
  if (!ownerId) return NextResponse.json([])

  const rows = await db.select().from(bookings).where(scopeEq(bookings.vendorId, ownerId))
  return NextResponse.json(rows)
}
