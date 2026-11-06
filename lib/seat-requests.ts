import { and, eq, inArray, lt } from 'drizzle-orm'
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

export const EXPIRED_NOTE = '日期已過'

// 台灣今天的日期（YYYY-MM-DD），伺服器在 Vercel 上是 UTC，不能直接用 new Date()
export function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

// 候選日期處理完之後重算整筆需求的狀態：還有候選待訂就是 pending，
// 全部處理完，有任何一個訂到算 booked；一個都沒訂到就整筆取消。已取消的需求不動。
export async function refreshRequestStatus(requestId: string) {
  const [req] = await db.select({ status: seatRequests.status }).from(seatRequests).where(eq(seatRequests.id, requestId))
  if (!req || req.status === 'cancelled') return
  const opts = await db.select({ status: seatRequestOptions.status, resultNote: seatRequestOptions.resultNote }).from(seatRequestOptions).where(eq(seatRequestOptions.requestId, requestId))
  const status = opts.some((o) => o.status === 'pending') ? 'pending' : opts.some((o) => o.status === 'booked') ? 'booked' : 'cancelled'
  if (status === req.status) return
  if (status === 'cancelled') {
    const allExpired = opts.every((o) => o.resultNote === EXPIRED_NOTE)
    await db.update(seatRequests).set({
      status,
      resultNote: allExpired ? '候選日期都過了，自動取消' : null,
      ...(allExpired ? { handledById: null, handledByName: '系統', handledAt: new Date() } : {}),
    }).where(eq(seatRequests.id, requestId))
  } else {
    await db.update(seatRequests).set({ status }).where(eq(seatRequests.id, requestId))
  }
}

// 日期已經過了還沒訂到的候選自動結束（標成「日期已過」）；
// 客人的候選全部結束又沒有訂到任何一個，整筆自動取消，還有沒過期的就繼續等
export async function expirePastOptions() {
  const expired = await db
    .update(seatRequestOptions)
    .set({ status: 'skipped', resultNote: EXPIRED_NOTE, handledById: null, handledByName: '系統', handledAt: new Date() })
    .where(and(eq(seatRequestOptions.status, 'pending'), lt(seatRequestOptions.bookingDate, taipeiToday())))
    .returning({ requestId: seatRequestOptions.requestId })
  for (const id of new Set(expired.map((e) => e.requestId))) await refreshRequestStatus(id)
}
