import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" "role"[]`
  await sql`UPDATE "users" SET "roles" = ARRAY["role"] WHERE "roles" IS NULL`
  await sql`ALTER TABLE "users" ALTER COLUMN "roles" SET NOT NULL`
  await sql`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`

  console.log('users.role -> users.roles[] 遷移完成')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
