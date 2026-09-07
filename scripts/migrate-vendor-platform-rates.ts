import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    CREATE TABLE IF NOT EXISTS vendor_platform_rates (
      vendor_id uuid PRIMARY KEY REFERENCES users(id),
      platform_fee_rate integer NOT NULL DEFAULT 20,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `
  console.log('vendor_platform_rates created (or already existed)')

  await sql`ALTER TABLE platform_settings DROP COLUMN IF EXISTS platform_fee_rate`
  console.log('dropped platform_settings.platform_fee_rate (moved to per-vendor table)')
}

main()
