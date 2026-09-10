import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { auth } from '@/auth'

// 輕量版帳號清單：給客服/管理員/後勤用來查廠商名稱、銷售人員下拉選單，
// 不像 /api/accounts 需要管理員權限（那支是帳號管理專用，功能更完整）。
export async function GET() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('admin') && !roles.includes('customer_service') && !roles.includes('logistics'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const rows = await db.select({ id: users.id, name: users.name, email: users.email, roles: users.roles }).from(users)
  return NextResponse.json(rows)
}
