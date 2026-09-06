import 'dotenv/config'
import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(sql`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS sold_count integer;
  `)
  console.log('✅ bookings.sold_count 已加入')

  await db.execute(sql`
    ALTER TABLE vendor_rate_settings
    ADD COLUMN IF NOT EXISTS platform_fee_rate integer;
  `)
  console.log('✅ vendor_rate_settings.platform_fee_rate 已加入')
}

main().catch(console.error)
