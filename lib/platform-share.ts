export type RateSettings = {
  platformFeeRate: number // 平台費率（%）
}

export type ShareBooking = {
  id: string
  bookingDate: string
  partySize: number | null
  agencyFee: string | number | null
}

export type ShareResult = {
  id: string
  bookingDate: string
  partySize: number
  actualFee: number
  platformFee: number
  vendorProfit: number
}

// 平台分潤：平台費 = 實收代訂費 × 平台費率%，廠商利潤 = 實收代訂費 - 平台費
export function computeShare(booking: ShareBooking, rates: RateSettings): ShareResult | null {
  const n = booking.partySize ?? 0
  const actualFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || actualFee === null || Number.isNaN(actualFee)) return null

  const platformFee = Math.round(actualFee * rates.platformFeeRate / 100)
  const vendorProfit = actualFee - platformFee

  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    partySize: n,
    actualFee,
    platformFee,
    vendorProfit,
  }
}
