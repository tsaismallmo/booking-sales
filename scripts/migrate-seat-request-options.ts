import { config } from 'dotenv'
config({ path: '.env.local' })

// 訂位需求改成「一個客人多個候選日期」：新增 seat_request_options，
// 把 seat_requests 原本單一日期的欄位搬過去後刪掉。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`DO $$ BEGIN
    CREATE TYPE seat_request_option_status AS ENUM ('pending', 'booked', 'failed', 'skipped');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  await sql`CREATE TABLE IF NOT EXISTS seat_request_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES seat_requests(id) ON DELETE CASCADE,
    priority integer NOT NULL DEFAULT 1,
    branch_id uuid REFERENCES branches(id),
    branch text,
    booking_date date NOT NULL,
    time_slot text,
    status seat_request_option_status NOT NULL DEFAULT 'pending',
    booking_code text,
    result_note text,
    handled_by_id uuid REFERENCES users(id),
    handled_by_name text,
    handled_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`
  console.log('✓ seat_request_options 已建立')

  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'seat_requests' AND column_name = 'booking_date'`
  if (cols.length > 0) {
    // 舊資料：一筆需求一個日期 → 變成一個候選
    const moved = await sql`INSERT INTO seat_request_options
        (request_id, priority, branch_id, branch, booking_date, time_slot, status, booking_code, result_note, handled_by_id, handled_by_name, handled_at, created_at)
      SELECT id, 1, branch_id, branch, booking_date, time_slot,
        (CASE status WHEN 'cancelled' THEN 'skipped' ELSE status::text END)::seat_request_option_status,
        booking_code, result_note, handled_by_id, handled_by_name, handled_at, created_at
      FROM seat_requests r
      WHERE NOT EXISTS (SELECT 1 FROM seat_request_options o WHERE o.request_id = r.id)
      RETURNING id`
    console.log(`✓ 舊需求轉成候選日期 ${moved.length} 筆`)
    await sql`ALTER TABLE seat_requests DROP COLUMN IF EXISTS branch_id, DROP COLUMN IF EXISTS branch, DROP COLUMN IF EXISTS booking_date, DROP COLUMN IF EXISTS time_slot, DROP COLUMN IF EXISTS booking_code`
    console.log('✓ seat_requests 舊欄位已移除')
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
