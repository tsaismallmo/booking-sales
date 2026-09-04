import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "booking_ids" uuid[]`
  await sql`UPDATE "booking_requests" SET "booking_ids" = ARRAY["booking_id"] WHERE "booking_ids" IS NULL`
  await sql`ALTER TABLE "booking_requests" ALTER COLUMN "booking_ids" SET NOT NULL`
  await sql`ALTER TABLE "booking_requests" DROP COLUMN IF EXISTS "booking_id"`

  console.log('booking_requests.booking_id -> booking_ids[] 遷移完成')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
