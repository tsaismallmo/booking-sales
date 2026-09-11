export type PlatformRates = {
  platformFeeRate: number // 平台費率（%），廠商拿剩下的
  csShareOfPlatformRate: number // 客服從平台費裡再抽的比例（%）
}

export const DEFAULT_PLATFORM_RATES: PlatformRates = {
  platformFeeRate: 20,
  csShareOfPlatformRate: 20,
}

export type ShareBooking = {
  id: string
  bookingDate: string
  partySize: number | null
  agencyFee: string | number | null
  platformFeeBase?: string | number | null // 平台抽成的計費基礎金額，留空就用 agencyFee 全額
  salespersonId?: string | null
}

export type ShareResult = {
  id: string
  bookingDate: string
  partySize: number
  actualFee: number
  platformFeeBase: number | null // 實際拿去算平台費的基礎金額；null 代表沒調整，用的是 actualFee 全額
  platformFeeRate: number
  platformFee: number
  vendorProfit: number
  csShare: number
  platformNet: number
  salespersonId: string | null
}

// 平台分潤：平台費 = 實收代訂費 × 平台費率，廠商利潤 = 實收代訂費 - 平台費
// 客服分潤：從平台費裡再抽一部分給銷售人員，平台實拿 = 平台費 - 客服分潤
export function computeShare(booking: ShareBooking, rates: PlatformRates): ShareResult | null {
  const n = booking.partySize ?? 0
  const actualFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || actualFee === null || Number.isNaN(actualFee)) return null

  const hasCustomBase = booking.platformFeeBase !== null && booking.platformFeeBase !== undefined
  const feeBase = hasCustomBase ? Number(booking.platformFeeBase) : actualFee
  const platformFee = Math.round(feeBase * rates.platformFeeRate / 100)
  const vendorProfit = actualFee - platformFee
  const csShare = Math.round(platformFee * rates.csShareOfPlatformRate / 100)
  const platformNet = platformFee - csShare

  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    partySize: n,
    actualFee,
    platformFeeBase: hasCustomBase ? feeBase : null,
    platformFeeRate: rates.platformFeeRate,
    platformFee,
    vendorProfit,
    csShare,
    platformNet,
    salespersonId: booking.salespersonId ?? null,
  }
}
