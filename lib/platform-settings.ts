import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { platformSettings, vendorPlatformRates } from '@/lib/db/schema'
import { DEFAULT_PLATFORM_RATES, type PlatformRates } from '@/lib/platform-share'

// 伺服器端專用：讀取分潤設定，不要在 client component 匯入這支檔案。

// 客服分潤比例是全部客服共用的一個全域值
export async function getCsShareRate(): Promise<number> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'global'))
  return row?.csShareOfPlatformRate ?? DEFAULT_PLATFORM_RATES.csShareOfPlatformRate
}

// 平台費率依廠商各別設定，沒設定過的用預設值
export async function getVendorPlatformFeeRate(vendorId: string): Promise<number> {
  const [row] = await db.select().from(vendorPlatformRates).where(eq(vendorPlatformRates.vendorId, vendorId))
  return row?.platformFeeRate ?? DEFAULT_PLATFORM_RATES.platformFeeRate
}

// 批次查詢多個廠商的平台費率，回傳 vendorId -> 費率 的對照表（沒設定過的廠商不會出現在表裡，呼叫端要自己 fallback 預設值）
export async function getVendorPlatformFeeRates(vendorIds: string[]): Promise<Map<string, number>> {
  if (vendorIds.length === 0) return new Map()
  const rows = await db.select().from(vendorPlatformRates).where(inArray(vendorPlatformRates.vendorId, vendorIds))
  return new Map(rows.map((r) => [r.vendorId, r.platformFeeRate]))
}

// 給單一廠商用的完整分潤設定（廠商自己的平台費率 + 全域客服分潤比例）
export async function getRatesForVendor(vendorId: string): Promise<PlatformRates> {
  const [platformFeeRate, csShareOfPlatformRate] = await Promise.all([
    getVendorPlatformFeeRate(vendorId),
    getCsShareRate(),
  ])
  return { platformFeeRate, csShareOfPlatformRate }
}
