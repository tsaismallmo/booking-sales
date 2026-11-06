import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // 姓名用帳號管理裡設定的（例如處理人員預設帶入），不用登入時 Google 帶來的名字
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.user.id))
  return NextResponse.json({
    id: session.user.id,
    email: session.user.email,
    name: me?.name ?? session.user.name ?? null,
    roles: session.user.roles,
    employerVendorId: session.user.employerVendorId ?? null,
  })
}
