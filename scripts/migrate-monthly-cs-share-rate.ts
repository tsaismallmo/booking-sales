import { config } from 'dotenv'
config({ path: '.env.local' })

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  const existing = await sql`SELECT cs_share_of_platform_rate FROM platform_settings WHERE key = 'global'`
  console.log('搬移前既有設定：', existing)
  const currentRate = existing.length > 0 ? existing[0].cs_share_of_platform_rate : 20

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`

  await sql`DROP TABLE IF EXISTS platform_settings`
  await sql`
    CREATE TABLE IF NOT EXISTS cs_share_rates (
      month text PRIMARY KEY,
      cs_share_of_platform_rate integer NOT NULL DEFAULT 20,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `
  console.log('cs_share_rates 建立完成（改成按月份儲存）')

  await sql`
    INSERT INTO cs_share_rates (month, cs_share_of_platform_rate)
    VALUES (${currentMonth}, ${currentRate})
    ON CONFLICT (month) DO UPDATE SET cs_share_of_platform_rate = ${currentRate}
  `
  console.log(`搬移：${currentMonth} 費率 ${currentRate}%`)
}

main()
