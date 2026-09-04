import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

// 開發用「切帳號」後門：只有 `next dev`（NODE_ENV === 'development'）能用，
// production build（Vercel 部署）會直接 404，不會有繞過登入的風險。
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: '缺少 email' }, { status: 400 })

  const [account] = await db.select().from(users).where(eq(users.email, email))
  if (!account) return NextResponse.json({ error: '找不到這個帳號' }, { status: 404 })

  const cookieName = 'authjs.session-token'
  const token = await encode({
    token: { email: account.email, sub: account.id, name: account.name },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
  })

  const res = NextResponse.redirect(new URL('/bookings', req.url))
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return res
}
