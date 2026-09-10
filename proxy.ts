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
  const isVendor = roles.includes('vendor')
  const isLogistics = roles.includes('logistics')
  // 依身份決定進來後預設帶去哪裡：廠商去單據管理，管理員去所有單據，純客服去看板，純後勤去需求處理
  const fallback = isVendor ? '/bookings' : isAdmin ? '/admin/bookings' : roles.includes('customer_service') ? '/dashboard' : isLogistics ? '/requests' : '/dashboard'

  // 帳號管理、分店對應表只給管理員
  if ((pathname.startsWith('/accounts') || pathname.startsWith('/branch-aliases')) && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 單據管理列表、解析簡訊建單：只給廠商，管理員有自己的「所有單據」頁面
  const isBookingsListRoute = pathname === '/bookings' || pathname.startsWith('/bookings/import-sms')
  if (isBookingsListRoute && !isVendor) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 新增單據：有廠商/管理員身份的人可以建任何類別；純客服也能進來，但只能建臨時單/預定單（API 會再擋一次）
  const canCreateBookings = isVendor || isAdmin || roles.includes('customer_service')
  if (pathname.startsWith('/bookings/new') && !canCreateBookings) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 需求看板給後勤人員／管理員／客服（客服看自己發起的進度，不能處理）
  if (pathname.startsWith('/requests') && !isLogistics && !isAdmin && !roles.includes('customer_service')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 預定單看板：給客服／管理員／後勤處理，廠商、廠商員工不用看（他們自己的單據走「單據管理」）
  if (pathname.startsWith('/dashboard/reserved') && !isLogistics && !isAdmin && !roles.includes('customer_service')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 廠商名單：廠商本人可管理，廠商員工可唯讀查看所屬廠商的名單
  if (pathname.startsWith('/roster') && !roles.includes('vendor') && !roles.includes('vendor_staff')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 訂位看板（月曆/Inline/EZTABLE）：廠商本人跟廠商員工都能看
  if (pathname.startsWith('/booking-board') && !roles.includes('vendor') && !roles.includes('vendor_staff')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 平台分潤：只有廠商本人跟管理員能看，廠商員工不行
  if (pathname.startsWith('/platform-share') && !roles.includes('vendor') && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 客服分潤：只有客服本人跟管理員能看
  if (pathname.startsWith('/cs-share') && !roles.includes('customer_service') && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 分潤設定、批次退訂、每月金流總覽、批次標記平台：只有管理員能看
  if ((pathname.startsWith('/admin/rates') || pathname.startsWith('/admin/bulk-refund') || pathname.startsWith('/admin/monthly-summary') || pathname.startsWith('/admin/bulk-tag-platform')) && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
