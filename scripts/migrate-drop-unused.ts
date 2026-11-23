import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'

// 刪掉沒在用的資料庫東西（可以重複執行）：
// - vendor_staff_options：舊的「人員選項」表，實際訂位人員／付款人員下拉改抓帳號後就沒用了
// - bookings.sold_count：實賣人數，分潤計算早就不用、也沒有任何資料
// 刪之前先把內容存成 JSON（路徑由第一個參數指定）
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out = process.argv[2]
  if (!out) throw new Error('請指定備份檔路徑')

  const [t] = await sql`SELECT to_regclass('public.vendor_staff_options') AS t`
  const staffOptions = t.t ? await sql`SELECT * FROM vendor_staff_options` : []
  const [c] = await sql`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'sold_count'`
  const soldCounts = Number(c.n) > 0 ? await sql`SELECT id, sold_count FROM bookings WHERE sold_count IS NOT NULL` : []
  writeFileSync(out, JSON.stringify({ vendor_staff_options: staffOptions, bookings_sold_count: soldCounts }, null, 2))
  console.log(`✓ 備份：人員選項 ${staffOptions.length} 筆、實賣人數 ${soldCounts.length} 筆 → ${out}`)

  await sql`DROP TABLE IF EXISTS vendor_staff_options`
  console.log('✓ vendor_staff_options 已刪除')
  await sql`ALTER TABLE bookings DROP COLUMN IF EXISTS sold_count`
  console.log('✓ bookings.sold_count 已刪除')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
