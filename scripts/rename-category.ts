import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`ALTER TYPE "booking_category" ADD VALUE IF NOT EXISTS '預定單'`
  await sql`UPDATE "bookings" SET "category" = '預定單' WHERE "category" = '預購單'`

  console.log('分類「預購單」已改為「預定單」')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
