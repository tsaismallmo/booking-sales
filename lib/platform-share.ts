import { isTaiwanHoliday, parseDateOnly } from '@/lib/quote'

export type RateSettings = {
  weekdayRate: number
  weekendRate: number
  platformFeePerPerson: number
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
  normalFee: number
  platformFee: number
  vendorProfit: number
  discounted: boolean
}

// 正常情況：平台固定抽「每人 platformFeePerPerson」，廠商利潤 = 實收代訂費 - 平台費。
// 如果實收代訂費低於「正常代訂費」（平日/假日費率 * 人數），代表這筆有優惠，
// 改成反過來算：廠商利潤鎖在正常情況下該有的金額，優惠的差額由平台吸收（平台費可能因此變少，甚至變負的）。
export function computeShare(booking: ShareBooking, rates: RateSettings): ShareResult | null {
  const n = booking.partySize ?? 0
  const actualFee = booking.agencyFee === null ? null : Number(booking.agencyFee)
  if (n <= 0 || actualFee === null || Number.isNaN(actualFee)) return null

  const rate = isTaiwanHoliday(parseDateOnly(booking.bookingDate)) ? rates.weekendRate : rates.weekdayRate
  const normalFee = rate * n
  const platformCut = rates.platformFeePerPerson * n
  const normalVendorProfit = normalFee - platformCut

  const discounted = actualFee < normalFee
  const platformFee = discounted ? actualFee - normalVendorProfit : platformCut
  const vendorProfit = discounted ? normalVendorProfit : actualFee - platformCut

  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    partySize: n,
    actualFee,
    normalFee,
    platformFee,
    vendorProfit,
    discounted,
  }
}
