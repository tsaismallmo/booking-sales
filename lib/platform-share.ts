// 平台分潤固定抽 20%，廠商拿 80%
export const PLATFORM_FEE_RATE = 20
// 客服分潤：從平台費裡再抽 20% 給實際銷售的客服（= 代訂費的 4%），不影響廠商的 80%
export const CS_SHARE_OF_PLATFORM_RATE = 20

export type ShareBooking = {
  id: string
  bookingDate: string
  partySize: number | null
  agencyFee: string | number | null
  salespersonId?: string | null
}

export type ShareResult = {
  id: string
  bookingDate: string
  partySize: number
  actualFee: number
  platformFee: number
  vendorProfit: number
  csShare: number
  platformNet: number
  salespersonId: string | null
}

// 平台分潤：平台費 = 實收代訂費 × 20%，廠商利潤 = 實收代訂費 - 平台費
// 客服分潤：從平台費裡再抽 20% 給銷售人員，平台實拿 = 平台費 - 客服分潤
export function computeShare(booking: ShareBooking): ShareResult | null {
  const n = booking.partySize ?? 0
  const actualFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || actualFee === null || Number.isNaN(actualFee)) return null

  const platformFee = Math.round(actualFee * PLATFORM_FEE_RATE / 100)
  const vendorProfit = actualFee - platformFee
  const csShare = Math.round(platformFee * CS_SHARE_OF_PLATFORM_RATE / 100)
  const platformNet = platformFee - csShare

  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    partySize: n,
    actualFee,
    platformFee,
    vendorProfit,
    csShare,
    platformNet,
    salespersonId: booking.salespersonId ?? null,
  }
}
