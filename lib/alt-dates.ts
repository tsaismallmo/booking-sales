import type { AltDate } from '@/lib/db/schema'
import { listBranchOptions, resolveBranch } from '@/lib/branches'

// 預定單的其他候選：前端送來的陣列整理一下，沒填日期的列丟掉，分店對回主檔，全部空的就存 null
export async function cleanAltDates(input: unknown): Promise<AltDate[] | null> {
  if (!Array.isArray(input)) return null
  const options = await listBranchOptions()
  const rows: AltDate[] = []
  for (const r of input) {
    const date = typeof r?.date === 'string' ? r.date.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const resolved = r?.branchId || r?.branch ? await resolveBranch({ branchId: r.branchId || null, branch: r.branch || null }, options) : { branchId: null, branch: null }
    const party = Number(r?.partySize)
    rows.push({
      date,
      timeSlot: typeof r?.timeSlot === 'string' && r.timeSlot.trim() ? r.timeSlot.trim() : null,
      branchId: resolved.branchId ?? null,
      branch: resolved.branch ?? null,
      partySize: Number.isFinite(party) && party > 0 ? party : null,
    })
  }
  return rows.length > 0 ? rows : null
}
