import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { findStock, matchesStock } from '@/lib/seat-requests'

// 登記訂位需求前先查：現貨單裡有沒有已經符合、還沒售出的位子
export async function GET(req: NextRequest) {
  const session = await requireRole('customer_service', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const p = req.nextUrl.searchParams
  const q = {
    branchId: p.get('branchId'),
    bookingDate: p.get('bookingDate') ?? '',
    timeSlot: p.get('timeSlot') || null,
    partySize: p.get('partySize') ? Number(p.get('partySize')) || null : null,
  }
  if (!q.branchId || !q.bookingDate) return NextResponse.json([])
  const stock = await findStock([q])
  return NextResponse.json(stock.filter((b) => matchesStock(q, b)))
}
