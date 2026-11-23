import { config } from 'dotenv'
config({ path: '.env.local' })

// 預定單可以記多個候選日期：bookings 加 alt_dates（jsonb）。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alt_dates jsonb`
  console.log('✓ bookings.alt_dates 已建立')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
