import { cookies } from 'next/headers'
import { asc, eq, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/types/next-auth'

// 廠商功能（廠商名單、訂位看板、訂金付款看板、解析簡訊…）原本都綁「登入的廠商」。
// 管理員沒有自己的廠商資料，改成在側邊欄選「代理廠商」，用那個廠商的範圍操作；
// 後勤只看訂位看板，看全部廠商。

export const ACT_AS_VENDOR_COOKIE = 'act_as_vendor'

type ScopeSession = { user: { id: string; roles: Role[]; employerVendorId?: string | null } }

export async function listVendors() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`'vendor' = ANY(${users.roles})`)
    .orderBy(asc(users.name))
}

// 管理員目前代理的廠商：cookie 選的（要是真的廠商）→ 自己就是廠商的話用自己 → 第一個廠商
async function adminActingVendorId(selfIfVendor: string | null) {
  const vendors = await listVendors()
  const picked = (await cookies()).get(ACT_AS_VENDOR_COOKIE)?.value
  if (picked && vendors.some((v) => v.id === picked)) return picked
  return selfIfVendor ?? vendors[0]?.id ?? null
}

// 讀取範圍：廠商 id；'all' = 不限廠商（後勤）；null = 沒有可看的
export async function vendorScope(session: ScopeSession): Promise<string | 'all' | null> {
  const roles = session.user.roles
  const isVendor = roles.includes('vendor')
  if (roles.includes('admin')) return adminActingVendorId(isVendor ? session.user.id : null)
  if (isVendor) return session.user.id
  if (roles.includes('vendor_staff') && session.user.employerVendorId) return session.user.employerVendorId
  if (roles.includes('logistics')) return 'all'
  return null
}

// 寫入範圍（新增／修改名單等）：廠商本人，或管理員代理的廠商；其他角色不能寫
export async function vendorWriteScope(session: ScopeSession): Promise<string | null> {
  const roles = session.user.roles
  const isVendor = roles.includes('vendor')
  if (roles.includes('admin')) return adminActingVendorId(isVendor ? session.user.id : null)
  if (isVendor) return session.user.id
  return null
}

// where 條件：'all' 不限廠商
export function scopeEq(column: AnyPgColumn, scope: string | 'all'): SQL {
  return scope === 'all' ? sql`true` : eq(column, scope)
}
