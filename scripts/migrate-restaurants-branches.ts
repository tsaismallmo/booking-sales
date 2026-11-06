import { config } from 'dotenv'
config({ path: '.env.local' })

// 餐廳／分店主檔轉移（可以重複執行）：
// 1. 建 restaurants、branches 兩張表，bookings、branch_aliases 加 branch_id 欄位（只新增，不動既有資料）
// 2. 自動備份一份目前資料（資料備份頁看得到，可以還原）
// 3. 目前所有分店都是漢來島語的：建「島語」餐廳，把單據／簡訊對應表裡用到的分店名稱建成島語的分店，
//    單據、對應表接上 branch_id，分店文字改成「島語｜分店」
const RESTAURANT = '島語'
const SEP = '｜'

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`CREATE TABLE IF NOT EXISTS restaurants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now()
  )`
  await sql`CREATE TABLE IF NOT EXISTS branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id),
    name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT branches_restaurant_name_unique UNIQUE (restaurant_id, name)
  )`
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id)`
  await sql`ALTER TABLE branch_aliases ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id)`
  console.log('✓ 資料表／欄位已建立')

  const { createSafetyBackup } = await import('../lib/backup')
  const backupId = await createSafetyBackup('餐廳／分店轉移前自動備份')
  console.log(`✓ 已備份（備份 id ${backupId}）`)

  await sql`INSERT INTO restaurants (name) VALUES (${RESTAURANT}) ON CONFLICT (name) DO NOTHING`
  const [restaurant] = await sql`SELECT id FROM restaurants WHERE name = ${RESTAURANT}`

  // 還沒接上主檔、也還不是「餐廳｜分店」格式的分店名稱
  const names = await sql`
    SELECT DISTINCT name FROM (
      SELECT branch AS name FROM bookings WHERE branch_id IS NULL AND branch IS NOT NULL AND branch <> '' AND position(${SEP} in branch) = 0
      UNION
      SELECT canonical_branch AS name FROM branch_aliases WHERE branch_id IS NULL AND position(${SEP} in canonical_branch) = 0
    ) t ORDER BY name`
  for (const [i, { name }] of names.entries()) {
    await sql`INSERT INTO branches (restaurant_id, name, sort_order) VALUES (${restaurant.id}, ${name}, ${i}) ON CONFLICT DO NOTHING`
  }
  console.log(`✓ 分店：${names.map((n) => n.name).join('、') || '（沒有新的）'}`)

  const updatedBookings = await sql`
    UPDATE bookings b SET branch_id = br.id, branch = ${RESTAURANT} || ${SEP} || br.name
    FROM branches br
    WHERE br.restaurant_id = ${restaurant.id} AND b.branch_id IS NULL AND b.branch = br.name
    RETURNING b.id`
  const updatedAliases = await sql`
    UPDATE branch_aliases a SET branch_id = br.id, canonical_branch = ${RESTAURANT} || ${SEP} || br.name
    FROM branches br
    WHERE br.restaurant_id = ${restaurant.id} AND a.branch_id IS NULL AND a.canonical_branch = br.name
    RETURNING a.id`
  console.log(`✓ 單據接上分店 ${updatedBookings.length} 筆、簡訊對應 ${updatedAliases.length} 筆`)

  const [left] = await sql`SELECT count(*)::int AS n FROM bookings WHERE branch_id IS NULL AND branch IS NOT NULL AND branch <> ''`
  console.log(`還有 ${left.n} 筆單據的分店沒接上主檔`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
