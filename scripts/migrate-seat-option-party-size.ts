import { config } from 'dotenv'
config({ path: '.env.local' })

// 訂位需求的人數改成每個候選日期各自填：seat_request_options 加 party_size，
// 把 seat_requests.party_size 帶到它底下的候選後刪掉。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`ALTER TABLE seat_request_options ADD COLUMN IF NOT EXISTS party_size integer`
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'seat_requests' AND column_name = 'party_size'`
  if (cols.length > 0) {
    const moved = await sql`UPDATE seat_request_options o SET party_size = r.party_size
      FROM seat_requests r WHERE o.request_id = r.id AND o.party_size IS NULL AND r.party_size IS NOT NULL RETURNING o.id`
    console.log(`✓ 人數帶到候選 ${moved.length} 筆`)
    await sql`ALTER TABLE seat_requests DROP COLUMN party_size`
    console.log('✓ seat_requests.party_size 已移除')
  }
  console.log('✓ 完成')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
