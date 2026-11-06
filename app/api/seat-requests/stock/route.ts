import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { findStock, matchesStock, type StockQuery } from '@/lib/seat-requests'

// 登記訂位需求前先查：每個候選日期在現貨單裡有沒有已經符合、還沒售出的位子。
// body: { options: [{ branchId, bookingDate, timeSlot, partySize }] } → 依候選順序，每個候選一個陣列
export async function POST(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const inputs: { branchId?: string; bookingDate?: string; timeSlot?: string; partySize?: string | number }[] = Array.isArray(body.options) ? body.options : []
  const queries: StockQuery[] = inputs.map((o) => ({ branchId: o.branchId || null, bookingDate: o.bookingDate ?? '', timeSlot: o.timeSlot || null, partySize: o.partySize ? Number(o.partySize) || null : null }))
  const stock = await findStock(queries.filter((q) => q.branchId && q.bookingDate))
  return NextResponse.json(queries.map((q) => (q.branchId && q.bookingDate ? stock.filter((b) => matchesStock(q, b)) : [])))
}
