import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'
import { getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

// 帳務對帳：依「帳戶」欄位分組，列出每個帳戶底下賣出的單據，錢要怎麼分——
// 廠商利潤（代訂費扣平台費後）歸這張單的廠商，平台費固定歸「雅婷」。
// 這是全部廠商彙總的報表，只有管理員看得到；依「售出日期」算月份，理由同其他分潤報表。
export async function GET(req: NextRequest) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: '缺少 from/to' }, { status: 400 })

  const rows = await db
    .select()
    .from(bookings)
    .where(and(
      inArray(bookings.category, ['現貨單', '臨時單']),
      eq(bookings.status, 'sold'),
      isNotNull(bookings.account),
      gte(bookings.soldDate, from),
      lte(bookings.soldDate, to)
    ))

  if (rows.length === 0) {
    return NextResponse.json({ accounts: [], totals: { vendorProfitTotal: 0, platformFeeTotal: 0, count: 0, vendorTotals: [] } })
  }

  const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
  const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
  const [vendorRateMap, vendorList] = await Promise.all([
    getVendorPlatformFeeRatesForMonths(vendorIds, months),
    vendorIds.length > 0 ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, vendorIds)) : Promise.resolve([]),
  ])
  const vendorNameById = new Map(vendorList.map((v) => [v.id, v.name || v.email]))

  type SettlementRow = {
    id: string
    bookingDate: string
    branch: string | null
    bookingCode: string | null
    account: string
    vendorId: string | null
    vendorName: string
    actualFee: number
    vendorProfit: number
    platformFee: number
  }

  const detail = rows.map((b): SettlementRow | null => {
    const month = b.soldDate ? b.soldDate.slice(0, 7) : null
    const vendorKey = b.vendorId && month ? `${b.vendorId}|${month}` : null
    const platformFeeRate = (vendorKey ? vendorRateMap.get(vendorKey) : undefined) ?? DEFAULT_PLATFORM_RATES.platformFeeRate
    const r = computeShare(b, { platformFeeRate, csShareOfPlatformRate: 0 })
    if (!r) return null
    return {
      id: b.id,
      bookingDate: b.bookingDate,
      branch: b.branch,
      bookingCode: b.bookingCode,
      account: b.account as string,
      vendorId: b.vendorId,
      vendorName: b.vendorId ? vendorNameById.get(b.vendorId) ?? '（未知廠商）' : '（無廠商歸屬）',
      actualFee: r.actualFee,
      vendorProfit: r.vendorProfit,
      platformFee: r.platformFee,
    }
  }).filter((r): r is SettlementRow => r !== null)

  // 依帳戶分組，組內再依廠商彙總廠商利潤；平台費固定歸雅婷，組內加總成一個數字
  type AccountGroup = { bookings: SettlementRow[]; vendorTotals: Map<string, { vendorName: string; amount: number }>; platformFeeTotal: number }
  const accountMap = new Map<string, AccountGroup>()
  for (const d of detail) {
    const group: AccountGroup = accountMap.get(d.account) ?? { bookings: [], vendorTotals: new Map(), platformFeeTotal: 0 }
    group.bookings.push(d)
    group.platformFeeTotal += d.platformFee
    const vKey = d.vendorId ?? 'none'
    const vTotal = group.vendorTotals.get(vKey) ?? { vendorName: d.vendorName, amount: 0 }
    vTotal.amount += d.vendorProfit
    group.vendorTotals.set(vKey, vTotal)
    accountMap.set(d.account, group)
  }

  const accounts = [...accountMap.entries()].map(([account, group]) => ({
    account,
    bookings: group.bookings.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate)),
    vendorTotals: [...group.vendorTotals.values()].sort((a, b) => b.amount - a.amount),
    platformFeeTotal: group.platformFeeTotal,
  })).sort((a, b) => a.account.localeCompare(b.account))

  const totals = detail.reduce(
    (acc, d) => ({ vendorProfitTotal: acc.vendorProfitTotal + d.vendorProfit, platformFeeTotal: acc.platformFeeTotal + d.platformFee, count: acc.count + 1 }),
    { vendorProfitTotal: 0, platformFeeTotal: 0, count: 0 }
  )

  // 全月總計：不分帳戶，把同一個廠商在各個帳戶底下的廠商利潤加總成一個數字，
  // 跟平台費總額（歸雅婷）一起列成「總計轉帳指示」
  const grandVendorMap = new Map<string, { vendorName: string; amount: number }>()
  for (const d of detail) {
    const vKey = d.vendorId ?? 'none'
    const vTotal = grandVendorMap.get(vKey) ?? { vendorName: d.vendorName, amount: 0 }
    vTotal.amount += d.vendorProfit
    grandVendorMap.set(vKey, vTotal)
  }
  const vendorTotals = [...grandVendorMap.values()].sort((a, b) => b.amount - a.amount)

  return NextResponse.json({ accounts, totals: { ...totals, vendorTotals } })
}
