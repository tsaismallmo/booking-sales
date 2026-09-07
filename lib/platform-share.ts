// 平台分潤固定抽 20%，廠商拿 80%
export const PLATFORM_FEE_RATE = 20

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

// 平台分潤：平台費 = 實收代訂費 × 20%，廠商利潤 = 實收代訂費 - 平台費
export function computeShare(booking: ShareBooking): ShareResult | null {
  const n = booking.partySize ?? 0
  const actualFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || actualFee === null || Number.isNaN(actualFee)) return null

  const platformFee = Math.round(actualFee * PLATFORM_FEE_RATE / 100)
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
