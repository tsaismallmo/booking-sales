import { config } from 'dotenv'
config({ path: '.env.local' })

// 單據加「買家」：售出時記錄賣給哪位客人（跟訂位用的姓名電話不同，訂位身份通常是廠商名單裡的人）。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buyer_name text`
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buyer_phone text`
  console.log('✓ bookings.buyer_name, bookings.buyer_phone')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
