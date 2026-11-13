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
  const isVendorStaff = roles.includes('vendor_staff')
  // 依身份決定進來後預設帶去哪裡：廠商去單據管理，管理員去所有單據，純客服去看板，純後勤去需求處理，純廠商員工去自己的單據管理
  const fallback = isVendor ? '/bookings' : isAdmin ? '/admin/bookings' : roles.includes('customer_service') ? '/dashboard' : isLogistics ? '/requests' : isVendorStaff ? '/bookings/booked' : '/dashboard'

  // 管理員可以使用全部功能（廠商功能用側邊欄選的代理廠商，見 lib/vendor-scope.ts）
  if (isAdmin) return response

  // 現貨單看板、已售看板：客服／管理員（導回的頁面剛好就是這裡時不擋，避免無限導向）
  if ((pathname === '/dashboard' || pathname.startsWith('/dashboard/sold')) && !isAdmin && !roles.includes('customer_service') && pathname !== fallback) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 帳號管理、分店對應表、餐廳／分店管理只給管理員
  if ((pathname.startsWith('/accounts') || pathname.startsWith('/branch-aliases') || pathname.startsWith('/restaurants')) && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 單據管理列表、解析簡訊建單：只給廠商，管理員有自己的「所有單據」頁面
  const isBookingsListRoute = pathname === '/bookings' || pathname.startsWith('/bookings/import-sms')
  if (isBookingsListRoute && !isVendor) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 廠商員工的單據管理：只列實際訂位人員是自己的單據
  if (pathname.startsWith('/bookings/booked') && !roles.includes('vendor_staff')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 新增單據：有廠商/管理員身份的人可以建任何類別；純客服也能進來，但只能建預定單（API 會再擋一次）
  const canCreateBookings = isVendor || isAdmin || roles.includes('customer_service')
  if (pathname.startsWith('/bookings/new') && !canCreateBookings) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 需求看板給後勤人員／管理員／客服；廠商、廠商員工不用看
  if (pathname.startsWith('/requests') && !isLogistics && !isAdmin && !roles.includes('customer_service')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 預定單看板：只給客服／管理員處理，廠商、廠商員工、後勤都不用看
  if (pathname.startsWith('/dashboard/reserved') && !isAdmin && !roles.includes('customer_service')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 廠商名單、人員選項：只給廠商本人（管理員在最前面已經放行）
  if ((pathname.startsWith('/roster') || pathname.startsWith('/staff-options')) && !isVendor) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 訂位看板（月曆/Inline/EZTABLE）：廠商本人、廠商員工（看所屬廠商）、後勤（看全部廠商）
  if (pathname.startsWith('/booking-board') && !isVendor && !isLogistics && !isVendorStaff) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 訂金付款看板、退訂提醒：只給廠商本人
  if ((pathname.startsWith('/deposit-board') || pathname.startsWith('/reminder')) && !isVendor) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 平台分潤：只有廠商本人跟管理員能看，廠商員工不行
  if (pathname.startsWith('/platform-share') && !roles.includes('vendor') && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 廠商員工分潤：只有廠商本人能看（廠商內部要分給員工多少的資料，員工跟管理員都不用看）
  if (pathname.startsWith('/vendor-staff-share') && !roles.includes('vendor')) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 客服分潤：只有客服本人跟管理員能看
  if (pathname.startsWith('/cs-share') && !roles.includes('customer_service') && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  // 分潤設定、批次作業（更新售出/退訂/標記平台）、每月金流總覽、資料備份、帳務對帳：只有管理員能看
  if ((pathname.startsWith('/admin/rates') || pathname.startsWith('/admin/bulk-actions') || pathname.startsWith('/admin/monthly-summary') || pathname.startsWith('/admin/backups') || pathname.startsWith('/admin/account-settlement')) && !isAdmin) {
    return NextResponse.redirect(new URL(fallback, req.url))
  }

  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
