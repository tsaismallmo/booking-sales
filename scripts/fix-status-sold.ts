import 'dotenv/config'
import { db } from '../lib/db'
import { bookings } from '../lib/db/schema'
import { and, eq, isNotNull } from 'drizzle-orm'

async function main() {
  // 先看有哪些單受影響
  const targets = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      branch: bookings.branch,
      bookingDate: bookings.bookingDate,
      soldDate: bookings.soldDate,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'unsold'),
        isNotNull(bookings.soldDate)
      )
    )

  if (targets.length === 0) {
    console.log('✅ 沒有需要修正的資料（沒有 soldDate 但 status 仍為 unsold 的單）')
    return
  }

  console.log(`找到 ${targets.length} 筆需要修正：`)
  targets.forEach(r => {
    console.log(`  ${r.bookingCode?.padEnd(12)} ${r.branch?.padEnd(8)} ${r.bookingDate}  soldDate=${r.soldDate}`)
  })

  const ids = targets.map(r => r.id)

  // 批次更新 status → sold
  let updated = 0
  for (const id of ids) {
    await db
      .update(bookings)
      .set({ status: 'sold', updatedAt: new Date() })
      .where(eq(bookings.id, id))
    updated++
  }

  console.log(`\n✅ 已更新 ${updated} 筆 status → sold`)
}

main().catch(console.error)
