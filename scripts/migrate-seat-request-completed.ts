import { config } from 'dotenv'
config({ path: '.env.local' })

// 訂位需求加「已完成」狀態：已訂到之後客服確認完成。可以重複執行。
async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  await sql`ALTER TYPE seat_request_status ADD VALUE IF NOT EXISTS 'completed'`
  console.log('✓ seat_request_status 加上 completed')
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
