import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, vendorRosterLists } from '@/lib/db/schema'

// 廠商員工在「實際訂位人員」上可能出現的名字：
//   1. 帳號姓名（例如「佩君」）
//   2. 所屬廠商底下、擁有者 email 是自己的名單名稱（例如名單「施佩君」）——
//      比對電話帶入實際訂位人員時填的是名單名稱，跟帳號姓名不一定一樣
export async function staffBookerNames(userId: string, employerVendorId: string | null | undefined) {
  const [me] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId))
  const names = new Set<string>()
  if (me?.name) names.add(me.name)
  if (me?.email && employerVendorId) {
    const lists = await db
      .select({ name: vendorRosterLists.name })
      .from(vendorRosterLists)
      .where(and(eq(vendorRosterLists.vendorId, employerVendorId), sql`lower(${vendorRosterLists.ownerEmail}) = lower(${me.email})`))
    for (const l of lists) names.add(l.name)
  }
  return [...names]
}
