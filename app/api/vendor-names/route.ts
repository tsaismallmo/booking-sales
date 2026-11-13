import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { auth } from '@/auth'

// 大量匯入檢查「訂單歸屬」用：管理員／客服 → 全部廠商帳號的名字；純廠商 → 只有自己
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const roles = session.user.roles
  const vendors = (await db.select({ id: users.id, name: users.name, roles: users.roles }).from(users))
    .filter((u): u is { id: string; name: string; roles: typeof u.roles } => u.roles.includes('vendor') && !!u.name)
  const visible = roles.includes('admin') || roles.includes('customer_service') ? vendors : vendors.filter((v) => v.id === session.user.id)
  return NextResponse.json(visible.map((v) => v.name).sort((a, b) => a.localeCompare(b, 'zh-Hant')))
}
