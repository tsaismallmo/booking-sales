import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { db } = await import('../lib/db')
  const { bookings } = await import('../lib/db/schema')
  const { eq, and, isNull } = await import('drizzle-orm')

  const names = ['蔡心悖', '李湘霆', '楊子晴', '王皓瑋', '吳佩萱', '劉思語', '林錫川', '劉怡君', '田昱辰', '黃潔欣', '楊思佳', '林珊妮', '余庭宜']
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.category, '現貨單'), isNull(bookings.customerName)))

  for (const row of rows) {
    const name = names[Math.floor(Math.random() * names.length)]
    const phone = `09${randInt(10000000, 99999999)}`
    await db.update(bookings).set({ customerName: name, customerPhone: phone }).where(eq(bookings.id, row.id))
  }

  console.log(`已補上 ${rows.length} 筆現貨單的訂位姓名/電話`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
