import { config } from 'dotenv'
config({ path: '.env.local' })

// 每間餐廳的退訂天數（可以重複執行）：
// 1. restaurants 加 cancel_days_before（預設 7 天），島語設成 3 天
// 2. 自動備份
// 3. 還沒填退訂期限、有接上分店的單據，照餐廳天數補上「訂位日期 − N 天」
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cancel_days_before integer NOT NULL DEFAULT 7`
  await sql`UPDATE restaurants SET cancel_days_before = 3 WHERE name = '島語'`
  console.log(await sql`SELECT name, cancel_days_before FROM restaurants`)

  const { createSafetyBackup } = await import('../lib/backup')
  console.log('備份 id', await createSafetyBackup('補退訂期限前自動備份'))

  const filled = await sql`
    UPDATE bookings b SET cancel_deadline = b.booking_date - r.cancel_days_before
    FROM branches br JOIN restaurants r ON r.id = br.restaurant_id
    WHERE br.id = b.branch_id AND b.cancel_deadline IS NULL
    RETURNING b.id`
  console.log(`補上退訂期限 ${filled.length} 筆`)
  console.log(await sql`SELECT count(*)::int AS total, count(cancel_deadline)::int AS has_deadline FROM bookings`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
