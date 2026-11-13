import { config } from 'dotenv'
config({ path: '.env.local' })

// 「實際訂位人員」「付款人員」下拉改成各自設定的選項（每個廠商各一份）。
// 第一次建立時，兩份清單都先用該廠商現有的名單名稱當選項（照原本順序），下拉不會變空。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  await sql`DO $$ BEGIN CREATE TYPE staff_option_kind AS ENUM ('booker', 'payer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  const existed = (await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_staff_options'`).length > 0
  await sql`
    CREATE TABLE IF NOT EXISTS vendor_staff_options (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES users(id),
      kind staff_option_kind NOT NULL,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT vendor_staff_options_unique UNIQUE (vendor_id, kind, name)
    )`
  if (!existed) {
    for (const kind of ['booker', 'payer']) {
      await sql`
        INSERT INTO vendor_staff_options (vendor_id, kind, name, sort_order)
        SELECT vendor_id, ${kind}::staff_option_kind, name, sort_order FROM vendor_roster_lists
        ON CONFLICT DO NOTHING`
    }
  }
  console.log('✓ vendor_staff_options', await sql`SELECT kind, count(*)::int AS n FROM vendor_staff_options GROUP BY kind`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
