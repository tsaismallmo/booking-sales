import { eq, and, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { csShareRates, salesChannels, vendorPlatformRates } from '@/lib/db/schema'
import { DEFAULT_PLATFORM_RATES, type PlatformRates } from '@/lib/platform-share'

// 伺服器端專用：讀取分潤設定，不要在 client component 匯入這支檔案。

// 客服分潤比例是全部客服共用的一個值，但依月份各別設定，沒設定過的月份用預設值
export async function getCsShareRate(month: string): Promise<number> {
  const [row] = await db.select().from(csShareRates).where(eq(csShareRates.month, month))
  return row?.csShareOfPlatformRate ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
}

// 批次查詢多個月份的客服分潤比例，回傳 month -> 比例 的對照表
// （沒設定過的月份不會出現在表裡，呼叫端要自己 fallback 預設值）
export async function getCsShareRatesForMonths(months: string[]): Promise<Map<string, number>> {
  if (months.length === 0) return new Map()
  const rows = await db.select().from(csShareRates).where(inArray(csShareRates.month, months))
  return new Map(rows.map((r) => [r.month, r.csShareOfPlatformRate]))
}

// ── 抽成 % ＝ 銷售平台基本 % × 廠商當月係數 ──

export type SalesChannel = { id: string; name: string; baseRate: number; isDefault: boolean }

export async function listSalesChannels(): Promise<SalesChannel[]> {
  const rows = await db.select().from(salesChannels).orderBy(asc(salesChannels.sortOrder), asc(salesChannels.createdAt))
  return rows.map((r) => ({ id: r.id, name: r.name, baseRate: Number(r.baseRate), isDefault: r.isDefault }))
}

// 廠商在某個月的係數，沒設定過是 1
export async function getVendorCoefficient(vendorId: string, month: string): Promise<number> {
  const [row] = await db.select({ coefficient: vendorPlatformRates.coefficient }).from(vendorPlatformRates)
    .where(and(eq(vendorPlatformRates.vendorId, vendorId), eq(vendorPlatformRates.month, month)))
  return row ? Number(row.coefficient) : DEFAULT_COEFFICIENT
}

// 批次查詢多個「廠商 + 月份」的係數，回傳 `${vendorId}|${month}` -> 係數（沒設定過的不在表裡，呼叫端用 1）
export async function getVendorCoefficientsForMonths(vendorIds: string[], months: string[]): Promise<Map<string, number>> {
  if (vendorIds.length === 0 || months.length === 0) return new Map()
  const rows = await db.select().from(vendorPlatformRates)
    .where(and(inArray(vendorPlatformRates.vendorId, vendorIds), inArray(vendorPlatformRates.month, months)))
  return new Map(rows.map((r) => [`${r.vendorId}|${r.month}`, Number(r.coefficient)]))
}

export const DEFAULT_COEFFICIENT = 1

// 報表一次算很多筆用：先把銷售平台和係數都讀好，再逐筆算抽成 %
export type ShareRateContext = { channels: SalesChannel[]; coefficients: Map<string, number> }

export async function loadShareRateContext(vendorIds: (string | null)[], months: (string | null)[]): Promise<ShareRateContext> {
  const ids = [...new Set(vendorIds.filter((v): v is string => !!v))]
  const ms = [...new Set(months.filter((m): m is string => !!m))]
  const [channels, coefficients] = await Promise.all([listSalesChannels(), getVendorCoefficientsForMonths(ids, ms)])
  return { channels, coefficients }
}

// 單據的銷售平台（沒指定或找不到就用預設平台）
export function channelOf(ctx: { channels: SalesChannel[] }, salesChannelId: string | null | undefined): SalesChannel {
  return ctx.channels.find((c) => c.id === salesChannelId)
    ?? ctx.channels.find((c) => c.isDefault)
    ?? { id: '', name: '平台', baseRate: DEFAULT_PLATFORM_RATES.platformFeeRate, isDefault: true }
}

// 這筆單據的抽成 %：銷售平台基本 % × 廠商在「這個月份」的係數
export function platformRateFor(
  ctx: ShareRateContext,
  b: { vendorId: string | null; salesChannelId?: string | null },
  month: string | null,
) {
  const coefficient = (b.vendorId && month ? ctx.coefficients.get(`${b.vendorId}|${month}`) : undefined) ?? DEFAULT_COEFFICIENT
  const channel = channelOf(ctx, b.salesChannelId)
  return { platformFeeRate: Number((channel.baseRate * coefficient).toFixed(6)), coefficient, channel }
}

// 給單一廠商、單一月份、單一單據用的完整分潤設定
export async function getRatesForBooking(
  b: { vendorId: string; salesChannelId?: string | null },
  month: string,
): Promise<PlatformRates> {
  const [ctx, csShareOfPlatformRate] = await Promise.all([loadShareRateContext([b.vendorId], [month]), getCsShareRate(month)])
  return { platformFeeRate: platformRateFor(ctx, b, month).platformFeeRate, csShareOfPlatformRate }
}
