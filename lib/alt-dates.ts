import type { AltDate } from '@/lib/db/schema'

// 預定單的其他候選日期：前端送來的陣列整理一下，沒填日期的列丟掉，全部空的就存 null
export function cleanAltDates(input: unknown): AltDate[] | null {
  if (!Array.isArray(input)) return null
  const rows = input
    .map((r) => ({
      date: typeof r?.date === 'string' ? r.date.trim() : '',
      timeSlot: typeof r?.timeSlot === 'string' && r.timeSlot.trim() ? r.timeSlot.trim() : null,
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
  return rows.length > 0 ? rows : null
}
