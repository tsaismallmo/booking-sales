import { isTaiwanHoliday, parseDateOnly } from '@/lib/quote'

export type RateSettings = {
  weekdayRate: number
  weekendRate: number
  platformFeePerPerson: number
  platformFeeRate?: number | null // 百分比模式：設定後取代 platformFeePerPerson
}

export type ShareBooking = {
  id: string
  bookingDate: string
  partySize: number | null
  soldCount?: number | null   // 實賣人數（只賣出部分座位時使用）
  agencyFee: string | number | null
}

export type ShareResult = {
  id: string
  bookingDate: string
  partySize: number
  soldCount: number           // 計算用的實賣人數（= partySize 若未填）
  actualFee: number           // 實收代訂費（按 soldCount 比例換算）
  normalFee: number           // 正常全座代訂費（weekdayRate/weekendRate × partySize）
  platformFee: number
  vendorProfit: number
  discounted: boolean
}

/**
 * 計算平台分潤。
 *
 * 百分比模式（platformFeeRate 有值）：
 *   actualFee = agencyFee × (soldCount / partySize)  ← 依實賣比例換算
 *   platformFee = actualFee × platformFeeRate%
 *   vendorProfit = actualFee × (100 - platformFeeRate)%
 *
 * 每人固定金額模式（platformFeeRate 為 null）：
 *   沿用舊邏輯（保留向下相容）。
 */
export function computeShare(booking: ShareBooking, rates: RateSettings): ShareResult | null {
  const n = booking.partySize ?? 0
  const rawFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || rawFee === null || Number.isNaN(rawFee)) return null

  const soldN = (booking.soldCount != null && booking.soldCount > 0)
    ? Math.min(booking.soldCount, n)
    : n

  const rate = isTaiwanHoliday(parseDateOnly(booking.bookingDate)) ? rates.weekendRate : rates.weekdayRate
  const normalFee = rate * n

  // 百分比模式
  if (rates.platformFeeRate != null) {
    // agencyFee 存的是「全座正常費用」，按 soldCount/partySize 換算出實收
    const actualFee = Math.round(rawFee * soldN / n)
    const platformFee = Math.round(actualFee * rates.platformFeeRate / 100)
    const vendorProfit = actualFee - platformFee
    return {
      id: booking.id,
      bookingDate: booking.bookingDate,
      partySize: n,
      soldCount: soldN,
      actualFee,
      normalFee,
      platformFee,
      vendorProfit,
      discounted: soldN < n,
    }
  }

  // 每人固定金額模式（舊邏輯，向下相容）
  const actualFee = rawFee
  const platformCut = rates.platformFeePerPerson * n
  const normalVendorProfit = normalFee - platformCut
  const discounted = actualFee < normalFee
  const platformFee = discounted ? actualFee - normalVendorProfit : platformCut
  const vendorProfit = discounted ? normalVendorProfit : actualFee - platformCut

  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    partySize: n,
    soldCount: soldN,
    actualFee,
    normalFee,
    platformFee,
    vendorProfit,
    discounted,
  }
}
