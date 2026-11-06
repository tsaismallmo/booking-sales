import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, seatRequestOptions, seatRequests } from '@/lib/db/schema'

export type StockQuery = { branchId: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null }

// 現貨單裡「還沒售出」、同分店同日期、時段相同（需求沒指定時段就不限）、人數夠的位子
export function matchesStock(q: StockQuery, b: { branchId: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null }) {
  if (!q.branchId || b.branchId !== q.branchId || b.bookingDate !== q.bookingDate) return false
  if (q.timeSlot && b.timeSlot !== q.timeSlot) return false
  if (q.partySize && b.partySize != null && b.partySize < q.partySize) return false
  return true
}

export async function findStock(queries: StockQuery[]) {
  const dates = [...new Set(queries.map((q) => q.bookingDate).filter(Boolean))]
  if (dates.length === 0) return []
  return db
    .select({ id: bookings.id, branchId: bookings.branchId, branch: bookings.branch, bookingDate: bookings.bookingDate, timeSlot: bookings.timeSlot, partySize: bookings.partySize, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(and(eq(bookings.category, '現貨單'), eq(bookings.status, 'unsold'), inArray(bookings.bookingDate, dates)))
}

// 候選日期處理完之後重算整筆需求的狀態：還有候選待訂就是 pending，
// 全部處理完，有任何一個訂到算 booked，否則 failed。已取消的需求不動。
export async function refreshRequestStatus(requestId: string) {
  const [req] = await db.select({ status: seatRequests.status }).from(seatRequests).where(eq(seatRequests.id, requestId))
  if (!req || req.status === 'cancelled') return
  const opts = await db.select({ status: seatRequestOptions.status }).from(seatRequestOptions).where(eq(seatRequestOptions.requestId, requestId))
  const status = opts.some((o) => o.status === 'pending') ? 'pending' : opts.some((o) => o.status === 'booked') ? 'booked' : 'failed'
  if (status !== req.status) await db.update(seatRequests).set({ status }).where(eq(seatRequests.id, requestId))
}
