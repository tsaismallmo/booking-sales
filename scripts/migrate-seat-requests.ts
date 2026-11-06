import { config } from 'dotenv'
config({ path: '.env.local' })

// 訂位需求（需求看板的「需要訂位」分頁）：只新增資料表，不動既有資料，可以重複執行
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`DO $$ BEGIN
    CREATE TYPE seat_request_status AS ENUM ('pending', 'booked', 'failed', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  await sql`CREATE TABLE IF NOT EXISTS seat_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid REFERENCES branches(id),
    branch text,
    booking_date date NOT NULL,
    time_slot text,
    party_size integer,
    customer_name text,
    customer_phone text,
    note text,
    status seat_request_status NOT NULL DEFAULT 'pending',
    booking_code text,
    result_note text,
    created_by_id uuid REFERENCES users(id),
    handled_by_id uuid REFERENCES users(id),
    handled_by_name text,
    handled_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`
  console.log('✓ seat_requests 已建立')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
