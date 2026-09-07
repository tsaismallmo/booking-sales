import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare } from '@/lib/platform-share'
import { getRatesForVendor } from '@/lib/platform-settings'

async function getVendorBookings(vendorId: string, from: string, to: string) {
  return db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.vendorId, vendorId),
      eq(bookings.category, '現貨單'),
      eq(bookings.status, 'sold'),
      gte(bookings.bookingDate, from),
      lte(bookings.bookingDate, to)
    ))
}

export async function GET(req: NextRequest) {
  const session = await requireRole('vendor', 'admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  const isVendor = session.user.roles.includes('vendor')
  const vendorId = isVendor ? session.user.id : req.nextUrl.searchParams.get('vendorId')

  if (vendorId) {
    const rates = await getRatesForVendor(vendorId)
    const rows = await getVendorBookings(vendorId, from, to)
    const results = rows.map((b) => computeShare(b, rates)).filter((r) => r !== null)
    const totals = results.reduce(
      (acc, r) => ({
        platformFee: acc.platformFee + r.platformFee,
        vendorProfit: acc.vendorProfit + r.vendorProfit,
        count: acc.count + 1,
      }),
      { platformFee: 0, vendorProfit: 0, count: 0 }
    )
    const detail = rows.map((b) => {
      const r = results.find((x) => x.id === b.id)
      return r ? { ...r, branch: b.branch, customerName: b.customerName, bookingCode: b.bookingCode } : null
    }).filter((r) => r !== null)

    return NextResponse.json({ mode: 'detail', vendorId, rates, bookings: detail, totals })
  }

  // 管理員沒指定廠商：回傳全部廠商的彙總（每個廠商用自己的平台費率）
  const vendors = (await db.select().from(users)).filter((u) => u.roles.includes('vendor'))
  const vendorSummaries = []
  for (const v of vendors) {
    const rates = await getRatesForVendor(v.id)
    const rows = await getVendorBookings(v.id, from, to)
    const results = rows.map((b) => computeShare(b, rates)).filter((r) => r !== null)
    if (results.length === 0) continue
    const totals = results.reduce(
      (acc, r) => ({ platformFee: acc.platformFee + r.platformFee, vendorProfit: acc.vendorProfit + r.vendorProfit }),
      { platformFee: 0, vendorProfit: 0 }
    )
    vendorSummaries.push({
      vendorId: v.id,
      vendorName: v.name || v.email,
      platformFeeRate: rates.platformFeeRate,
      bookingCount: results.length,
      platformFee: totals.platformFee,
      vendorProfit: totals.vendorProfit,
    })
  }
  const grandTotals = vendorSummaries.reduce(
    (acc, v) => ({ platformFee: acc.platformFee + v.platformFee, vendorProfit: acc.vendorProfit + v.vendorProfit, count: acc.count + v.bookingCount }),
    { platformFee: 0, vendorProfit: 0, count: 0 }
  )

  return NextResponse.json({ mode: 'summary', vendors: vendorSummaries, totals: grandTotals })
}
