import { config } from 'dotenv'
config({ path: '.env.local' })

// 分潤改成「銷售平台基本 % × 廠商係數」：
//   1. 建 sales_channels，放「平台」（基本 20%，預設）和「樂園」（基本 % 先放 20，之後在分潤設定頁改）
//   2. bookings 加 sales_channel_id（空的＝預設平台，舊單據不用補）
//   3. vendor_platform_rates 加 coefficient，舊的平台 % 換算成係數（舊 % ÷ 平台基本 20），以前月份算出來的金額不變
// 可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    CREATE TABLE IF NOT EXISTS sales_channels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      base_rate numeric NOT NULL,
      is_default boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )`
  await sql`INSERT INTO sales_channels (name, base_rate, is_default, sort_order) VALUES ('平台', 20, true, 0) ON CONFLICT (name) DO NOTHING`
  await sql`INSERT INTO sales_channels (name, base_rate, is_default, sort_order) VALUES ('樂園', 20, false, 1) ON CONFLICT (name) DO NOTHING`
  console.log('✓ sales_channels', await sql`SELECT name, base_rate, is_default FROM sales_channels ORDER BY sort_order`)

  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sales_channel_id uuid REFERENCES sales_channels(id)`
  console.log('✓ bookings.sales_channel_id')

  const hadColumn = (await sql`
    SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_platform_rates' AND column_name = 'coefficient'`).length > 0
  await sql`ALTER TABLE vendor_platform_rates ADD COLUMN IF NOT EXISTS coefficient numeric NOT NULL DEFAULT 1`
  if (!hadColumn) {
    await sql`UPDATE vendor_platform_rates SET coefficient = round(platform_fee_rate::numeric / 20, 4)`
  }
  console.log('✓ vendor_platform_rates.coefficient', await sql`SELECT month, platform_fee_rate, coefficient FROM vendor_platform_rates ORDER BY month`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
