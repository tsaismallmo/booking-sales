import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { db } = await import('../lib/db')
  const { users, bookings } = await import('../lib/db/schema')
  const { eq } = await import('drizzle-orm')

  // 確保有兩個廠商帳號可以測試「跨廠商看得到/看不到」的情境
  async function ensureUser(email: string, name: string, roles: ('admin' | 'vendor' | 'customer_service')[]) {
    const [existing] = await db.select().from(users).where(eq(users.email, email))
    if (existing) return existing
    const [row] = await db.insert(users).values({ email, name, roles }).returning()
    return row
  }

  const vendorA = await ensureUser('test111@gmail.com', '恩', ['vendor', 'customer_service'])
  const vendorB = await ensureUser('vendor2@gmail.com', '小美', ['vendor'])
  const csUser = await ensureUser('csonly@gmail.com', 'CS Only', ['customer_service'])
  void csUser

  const branches = ['漢來美食-島語-台北漢來店', '漢來美食-島語-高雄漢來店', '漢來美食-島語-台中漢來店']
  const categories = ['預定單', '臨時單', '現貨單'] as const
  const statuses = ['unsold', 'reserved', 'sold', 'refunded'] as const
  const timeSlots = ['11:30', '13:00', '14:30', '17:30', '18:30', '19:30']
  const sources = ['官方', '朋友', 'FB社團', 'Line社群']
  const customerNames = ['王小明', '陳雅婷', '林建宏', '張淑芬', '李佳蓉', '黃志偉', '吳美玲', '劉冠廷']

  const rand = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

  const today = new Date()
  const rows = []

  for (let i = 0; i < 40; i++) {
    const vendor = i % 4 === 0 ? vendorB : vendorA
    const status = rand(statuses)
    const dayOffset = randInt(-10, 45)
    const date = new Date(today)
    date.setDate(date.getDate() + dayOffset)
    const bookingDate = date.toISOString().split('T')[0]
    const partySize = randInt(1, 10)
    const depositAmount = randInt(500, 3000)
    const isSoldLike = status === 'sold' || status === 'reserved'

    rows.push({
      vendorId: vendor.id,
      branch: rand(branches),
      category: rand(categories),
      bookingDate,
      timeSlot: rand(timeSlots),
      partySize,
      bookingCode: String(randInt(1001, 1099)),
      status,
      cancelDeadline: null,
      paymentDeadline: null,
      depositAmount: String(depositAmount),
      depositPayer: vendor.name,
      customerName: isSoldLike ? rand(customerNames) : null,
      customerPhone: isSoldLike ? `09${randInt(10000000, 99999999)}` : null,
      source: isSoldLike ? rand(sources) : null,
      soldDate: status === 'sold' ? bookingDate : null,
      collectedAmount: status === 'sold' ? String(depositAmount + randInt(500, 2000)) : null,
      account: status === 'sold' ? rand(['雅婷玉山', '雅婷中信', '恩台新']) : null,
      salespersonId: isSoldLike ? vendorA.id : null,
      agencyFee: status === 'sold' ? String(randInt(200, 800)) : null,
      info: null,
      note: null,
    })
  }

  await db.insert(bookings).values(rows)
  console.log(`已建立 ${rows.length} 筆假單據（廠商：${vendorA.email} / ${vendorB.email}）`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
