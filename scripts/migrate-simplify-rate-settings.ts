import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`UPDATE vendor_rate_settings SET platform_fee_rate = 20 WHERE platform_fee_rate IS NULL`
  console.log('backfilled null platform_fee_rate -> 20')

  await sql`ALTER TABLE vendor_rate_settings ALTER COLUMN platform_fee_rate SET NOT NULL`
  await sql`ALTER TABLE vendor_rate_settings ALTER COLUMN platform_fee_rate SET DEFAULT 20`
  console.log('platform_fee_rate is now NOT NULL default 20')

  await sql`ALTER TABLE vendor_rate_settings DROP COLUMN IF EXISTS weekday_rate`
  await sql`ALTER TABLE vendor_rate_settings DROP COLUMN IF EXISTS weekend_rate`
  await sql`ALTER TABLE vendor_rate_settings DROP COLUMN IF EXISTS platform_fee_per_person`
  console.log('dropped weekday_rate / weekend_rate / platform_fee_per_person')
}

main()
