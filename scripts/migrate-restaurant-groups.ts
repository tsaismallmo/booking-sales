import { config } from 'dotenv'
config({ path: '.env.local' })

// 餐廳集團：同一支電話在不同集團登記的名字可能不同。
//   1. 建 restaurant_groups，先放「漢來」「饗賓」
//   2. restaurants 加 group_id：島語 → 漢來；旭集、饗饗、饗AJOY、URBAN PARADISE → 饗賓
//   3. vendor_roster_entries 加 group_id（空的＝所有集團都適用，舊名單不用補）
// 可以重複執行（已經設定過集團的餐廳不會被蓋掉）。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  await sql`
    CREATE TABLE IF NOT EXISTS restaurant_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )`
  await sql`INSERT INTO restaurant_groups (name, sort_order) VALUES ('漢來', 0), ('饗賓', 1) ON CONFLICT (name) DO NOTHING`
  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES restaurant_groups(id)`
  await sql`ALTER TABLE vendor_roster_entries ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES restaurant_groups(id)`
  await sql`UPDATE restaurants SET group_id = (SELECT id FROM restaurant_groups WHERE name = '漢來') WHERE group_id IS NULL AND name IN ('島語')`
  await sql`UPDATE restaurants SET group_id = (SELECT id FROM restaurant_groups WHERE name = '饗賓') WHERE group_id IS NULL AND name IN ('旭集', '饗饗', '饗AJOY', 'URBAN PARADISE')`
  console.log('✓ restaurant_groups', await sql`SELECT r.name, g.name AS group_name FROM restaurants r LEFT JOIN restaurant_groups g ON g.id = r.group_id ORDER BY r.name`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
