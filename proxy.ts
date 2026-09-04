import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const response = NextResponse.next({ request: { headers: req.headers } })
  response.headers.set('x-pathname', pathname)

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return response
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 帳號管理只給管理員
  if (pathname.startsWith('/accounts') && req.auth.user?.role !== 'admin') {
    return NextResponse.redirect(new URL('/bookings', req.url))
  }

  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
