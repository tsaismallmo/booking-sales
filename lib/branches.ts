import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, restaurants, bookings, branchAliases } from '@/lib/db/schema'

// 單據上的分店顯示文字：「餐廳｜分店」
export const BRANCH_SEPARATOR = '｜'
export function branchLabel(restaurantName: string, branchName: string) {
  return `${restaurantName}${BRANCH_SEPARATOR}${branchName}`
}

export type BranchOption = { id: string; name: string; restaurantId: string; restaurantName: string; label: string; active: boolean; cancelDaysBefore: number; groupId: string | null }

export async function listBranchOptions(): Promise<BranchOption[]> {
  const rows = await db
    .select({ id: branches.id, name: branches.name, active: branches.active, restaurantId: restaurants.id, restaurantName: restaurants.name, restaurantActive: restaurants.active, cancelDaysBefore: restaurants.cancelDaysBefore, groupId: restaurants.groupId, rSort: restaurants.sortOrder, bSort: branches.sortOrder })
    .from(branches)
    .innerJoin(restaurants, eq(branches.restaurantId, restaurants.id))
  return rows
    .sort((a, b) => a.rSort - b.rSort || a.restaurantName.localeCompare(b.restaurantName) || a.bSort - b.bSort || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, name: r.name, restaurantId: r.restaurantId, restaurantName: r.restaurantName, label: branchLabel(r.restaurantName, r.name), active: r.active && r.restaurantActive, cancelDaysBefore: r.cancelDaysBefore, groupId: r.groupId }))
}

// 退訂期限＝訂位日期往前推餐廳設定的天數（日期都是 YYYY-MM-DD 純文字，用 UTC 算避免時區差一天）
export function cancelDeadlineFor(bookingDate: string | null | undefined, daysBefore: number | null | undefined) {
  if (!bookingDate || daysBefore == null || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return null
  const d = new Date(`${bookingDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - daysBefore)
  return d.toISOString().slice(0, 10)
}

export async function defaultCancelDeadline(branchId: string | null, bookingDate: string | null | undefined, options?: BranchOption[]) {
  if (!branchId) return null
  const opts = options ?? (await listBranchOptions())
  return cancelDeadlineFor(bookingDate, opts.find((o) => o.id === branchId)?.cancelDaysBefore)
}

// 餐廳或分店改名、分店換餐廳之後，把指到這些分店的單據／簡訊對應文字一起更新成新的「餐廳｜分店」
export async function syncBranchTexts(branchIds: string[]) {
  if (branchIds.length === 0) return
  const opts = (await listBranchOptions()).filter((o) => branchIds.includes(o.id))
  for (const o of opts) {
    await db.update(bookings).set({ branch: o.label }).where(eq(bookings.branchId, o.id))
    await db.update(branchAliases).set({ canonicalBranch: o.label }).where(eq(branchAliases.branchId, o.id))
  }
}

export async function branchIdsOfRestaurant(restaurantId: string) {
  const rows = await db.select({ id: branches.id }).from(branches).where(eq(branches.restaurantId, restaurantId))
  return rows.map((r) => r.id)
}

// 把前端送來的分店（branchId 或文字）整理成要存進單據的 { branchId, branch }：
//   有 branchId → 照主檔寫成「餐廳｜分店」
//   只有文字 → 先比「餐廳｜分店」全名，再比分店名稱（只有剛好一間同名才算），對不到就原樣保留文字、branchId 留空
//   （舊版程式、Excel 匯入、簡訊對應表還沒對到主檔的情況都會走這條，不會因此建不了單）
export async function resolveBranch(input: { branchId?: string | null; branch?: string | null }, options?: BranchOption[]) {
  const opts = options ?? (await listBranchOptions())
  if (input.branchId) {
    const hit = opts.find((o) => o.id === input.branchId)
    if (hit) return { branchId: hit.id, branch: hit.label }
  }
  const text = input.branch?.trim()
  if (!text) return { branchId: null, branch: null }
  const byLabel = opts.find((o) => o.label === text)
  if (byLabel) return { branchId: byLabel.id, branch: byLabel.label }
  const byName = opts.filter((o) => o.name === text)
  if (byName.length === 1) return { branchId: byName[0].id, branch: byName[0].label }
  return { branchId: null, branch: text }
}

// 分店所屬的餐廳集團（漢來、饗賓…）；分店對不到主檔或餐廳沒設集團就是 null
export async function groupIdOfBranch(input: { branchId?: string | null; branch?: string | null }) {
  if (!input.branchId && !input.branch?.trim()) return null
  const opts = await listBranchOptions()
  const r = await resolveBranch(input, opts)
  return opts.find((o) => o.id === r.branchId)?.groupId ?? null
}
