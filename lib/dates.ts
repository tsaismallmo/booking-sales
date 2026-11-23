// 日期小工具：全站共用，日期一律用 "YYYY-MM-DD" 字串（本地時區），月份用 "YYYY-MM"

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// month0 是 0 起算（跟 Date#getMonth 一樣）
export function ymd(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

export function toYmd(d: Date) {
  return ymd(d.getFullYear(), d.getMonth(), d.getDate())
}

export function todayStr() {
  return toYmd(new Date())
}

export function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// "2026-11" → { from: "2026-11-01", to: "2026-11-30" }
export function monthRange(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDay)}` }
}

// 試算表／簡訊裡各種寫法的日期 → "YYYY-MM-DD"；看不懂就回空字串
// 支援：2026-04-05、2026/4/5、4/5、4-5、4月5日，後面可以帶「週三」「星期一」之類的；沒寫年份就當今年
export function normalizeDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = raw.trim().replace(/\s*(週|周|星期)[一二三四五六日天]\s*/g, '').trim()
  const full = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (full) return `${full[1]}-${pad2(Number(full[2]))}-${pad2(Number(full[3]))}`
  const short = s.match(/^(\d{1,2})[/-](\d{1,2})$/) ?? s.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (short) {
    const m = Number(short[1])
    const d = Number(short[2])
    return `${new Date().getFullYear()}-${pad2(m)}-${pad2(d)}`
  }
  return ''
}
