import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'

export type StockQuery = { branchId: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null }

// 現貨單裡「還沒售出」、同分店同日期、時段相同（需求沒指定時段就不限）、人數夠的位子
export function matchesStock(q: StockQuery, b: { branchId: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null }) {
  if (!q.branchId || b.branchId !== q.branchId || b.bookingDate !== q.bookingDate) return false
  if (q.timeSlot && b.timeSlot !== q.timeSlot) return false
  if (q.partySize && b.partySize != null && b.partySize < q.partySize) return false
  return true
}

export async function findStock(queries: StockQuery[]) {
  const dates = [...new Set(queries.map((q) => q.bookingDate))]
  if (dates.length === 0) return []
  return db
    .select({ id: bookings.id, branchId: bookings.branchId, branch: bookings.branch, bookingDate: bookings.bookingDate, timeSlot: bookings.timeSlot, partySize: bookings.partySize, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(and(eq(bookings.category, '現貨單'), eq(bookings.status, 'unsold'), inArray(bookings.bookingDate, dates)))
}
