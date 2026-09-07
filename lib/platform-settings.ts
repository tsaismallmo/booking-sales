import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { platformSettings } from '@/lib/db/schema'
import { DEFAULT_PLATFORM_RATES, type PlatformRates } from '@/lib/platform-share'

// 伺服器端專用：讀取全域分潤設定，沒設定過就用預設值。不要在 client component 匯入這支檔案。
export async function getPlatformRates(): Promise<PlatformRates> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'global'))
  return row ?? DEFAULT_PLATFORM_RATES
}
