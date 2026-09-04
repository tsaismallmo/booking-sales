import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { db } = await import('../lib/db')
  const { users } = await import('../lib/db/schema')
  await db.insert(users).values({
    email: 'tsaismallmo@gmail.com',
    name: 'Aaron',
    role: 'admin',
  }).onConflictDoNothing()
  console.log('已建立初始管理員帳號：tsaismallmo@gmail.com')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
