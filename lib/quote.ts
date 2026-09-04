// 報價／報時間相關的共用邏輯，邏輯照搬自 booking-board 的「訂位查詢」功能

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function getMealPeriod(time: string | null | undefined): '午餐' | '下午茶' | '晚餐' | null {
  const t = (time || '').trim()
  if (!t) return null
  if (t === '14:30') return '下午茶'
  if (t < '14:30') return '午餐'
  return '晚餐'
}

function isWeekend(d: Date) {
  const day = d.getDay()
  return day === 0 || day === 6
}

// 台灣國定假日中「平日放假」的日期（週六日已經由 isWeekend 判斷，這裡只列不在週末的國定假日/補假）
const TW_HOLIDAYS = new Set([
  '2026-1-1', '2026-2-16', '2026-2-17', '2026-2-18', '2026-2-19', '2026-2-20', '2026-2-27',
  '2026-4-3', '2026-4-6', '2026-5-1', '2026-6-19', '2026-9-25', '2026-9-28', '2026-10-9', '2026-10-26', '2026-12-25',
  '2027-1-1', '2027-2-4', '2027-2-5', '2027-2-8', '2027-2-9', '2027-2-10', '2027-3-1',
  '2027-4-5', '2027-4-6', '2027-4-30', '2027-6-9', '2027-9-15', '2027-9-28', '2027-10-11', '2027-10-25', '2027-12-24', '2027-12-31',
])

export function isTaiwanHoliday(d: Date) {
  return isWeekend(d) || TW_HOLIDAYS.has(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
}

// 'YYYY-MM-DD' 字串轉本地時區的 Date（避免 new Date('YYYY-MM-DD') 被當成 UTC 造成日期跑掉一天）
export function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dateLabel(dateStr: string) {
  const d = parseDateOnly(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} 週${WEEKDAYS[d.getDay()]}`
}

export const QUOTE_CLOSING = `匯款完成後我會提供你
訂位大名+手機+訂位代號

以上OK沒問題的話跟我說一聲給你帳號

✨ 訂位皆依照匯款順序出售，恕不保留🙏`

const PRICE_SETTINGS_KEY = 'booking-sales-price-settings'

export type PriceSettings = { weekdayRate: number; weekendRate: number }

export function loadPriceSettings(): PriceSettings {
  const fallback = { weekdayRate: 300, weekendRate: 300 }
  if (typeof window === 'undefined') return fallback
  try {
    const stored = localStorage.getItem(PRICE_SETTINGS_KEY)
    if (stored) return { ...fallback, ...JSON.parse(stored) }
  } catch {
    // 用預設值
  }
  return fallback
}

export function savePriceSettings(settings: PriceSettings) {
  try {
    localStorage.setItem(PRICE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 存不了就算了，不影響當次使用
  }
}
