import { config } from 'dotenv'
config({ path: '.env.local' })

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  // 舊表是「一個廠商一筆、沒有月份」；把現有設定值先讀出來，
  // 當成「這個月（伺服器目前所在月份）」的設定值搬過去新表，不遺失既有設定。
  const existing = await sql`SELECT vendor_id, platform_fee_rate FROM vendor_platform_rates`
  console.log('搬移前既有設定：', existing)

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`

  await sql`DROP TABLE IF EXISTS vendor_platform_rates`
  await sql`
    CREATE TABLE vendor_platform_rates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES users(id),
      month text NOT NULL,
      platform_fee_rate integer NOT NULL DEFAULT 20,
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (vendor_id, month)
    )
  `
  console.log('vendor_platform_rates 重建完成（改成按月份儲存）')

  for (const row of existing) {
    await sql`
      INSERT INTO vendor_platform_rates (vendor_id, month, platform_fee_rate)
      VALUES (${row.vendor_id}, ${currentMonth}, ${row.platform_fee_rate})
    `
    console.log(`搬移：廠商 ${row.vendor_id} → ${currentMonth} 費率 ${row.platform_fee_rate}%`)
  }
}

main()
