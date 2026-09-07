import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { platformSettings, vendorPlatformRates } from '@/lib/db/schema'
import { DEFAULT_PLATFORM_RATES, type PlatformRates } from '@/lib/platform-share'

// 伺服器端專用：讀取分潤設定，不要在 client component 匯入這支檔案。

// 客服分潤比例是全部客服共用的一個全域值（不分月份）
export async function getCsShareRate(): Promise<number> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'global'))
  return row?.csShareOfPlatformRate ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
}

// 平台費率依「廠商 + 月份」各別設定，沒設定過的月份用預設值，改某個月不會動到其他月份
export async function getVendorPlatformFeeRate(vendorId: string, month: string): Promise<number> {
  const [row] = await db.select().from(vendorPlatformRates)
    .where(and(eq(vendorPlatformRates.vendorId, vendorId), eq(vendorPlatformRates.month, month)))
  return row?.platformFeeRate ?? DEFAULT_PLATFORM_RATES.platformFeeRate
}

// 批次查詢多個「廠商 + 月份」組合的平台費率，回傳 `${vendorId}|${month}` -> 費率 的對照表
// （沒設定過的組合不會出現在表裡，呼叫端要自己 fallback 預設值）
export async function getVendorPlatformFeeRatesForMonths(
  vendorIds: string[],
  months: string[]
): Promise<Map<string, number>> {
  if (vendorIds.length === 0 || months.length === 0) return new Map()
  const rows = await db.select().from(vendorPlatformRates)
    .where(and(inArray(vendorPlatformRates.vendorId, vendorIds), inArray(vendorPlatformRates.month, months)))
  return new Map(rows.map((r) => [`${r.vendorId}|${r.month}`, r.platformFeeRate]))
}

// 給單一廠商、單一月份用的完整分潤設定（該月的平台費率 + 全域客服分潤比例）
export async function getRatesForVendorMonth(vendorId: string, month: string): Promise<PlatformRates> {
  const [platformFeeRate, csShareOfPlatformRate] = await Promise.all([
    getVendorPlatformFeeRate(vendorId, month),
    getCsShareRate(),
  ])
  return { platformFeeRate, csShareOfPlatformRate }
}
