import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const response = NextResponse.next({ request: { headers: req.headers } })
  response.headers.set('x-pathname', pathname)

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return response
  }

  // 開發用帳號切換後門：只有 dev 環境有效，API 路由自己也會再檢查一次 NODE_ENV
  if (process.env.NODE_ENV === 'development' && (pathname.startsWith('/dev') || pathname.startsWith('/api/dev'))) {
    return response
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const roles = req.auth.user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isLogistics = roles.includes('logistics')
  const canManageBookings = roles.includes('vendor') || isAdmin
  // 依身份決定進來後預設帶去哪裡：能管理單據的去單據管理，純客服去看板，純後勤去需求處理
  const fallback = canManageBookings ? '/bookings' : roles.includes('customer_service') ? '/dashboard' : isLogistics ? '/requests' : '/dashboard'

  // 帳號管理、分店對應表只給管理員
  if ((pathname.startsWith('/accounts') || pathname.startsWith('/branch-aliases')) && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 單據管理列表、解析簡訊建單，只給有廠商或管理員身份的人，純客服看不到
  const isBookingsListRoute = pathname === '/bookings' || pathname.startsWith('/bookings/import-sms')
  if (isBookingsListRoute && !canManageBookings) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 新增單據：有廠商/管理員身份的人可以建任何類別；純客服也能進來，但只能建臨時單/預定單（API 會再擋一次）
  const canCreateBookings = canManageBookings || roles.includes('customer_service')
  if (pathname.startsWith('/bookings/new') && !canCreateBookings) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 需求看板給後勤人員／管理員／客服（客服看自己發起的進度，不能處理）
  if (pathname.startsWith('/requests') && !isLogistics && !isAdmin && !roles.includes('customer_service')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 廠商名單只有廠商本人能用
  if (pathname.startsWith('/roster') && !roles.includes('vendor')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
