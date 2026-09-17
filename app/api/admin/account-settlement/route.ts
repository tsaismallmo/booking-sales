import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { computeShare, DEFAULT_PLATFORM_RATES } from '@/lib/platform-share'
import { getVendorPlatformFeeRatesForMonths } from '@/lib/platform-settings'

const PLATFORM_FEE_RECIPIENT = '雅婷'

// 帳務對帳：「帳戶」欄位存的其實是「人名+銀行」（例如「雅婷國泰」「婉亭中信」），
// 同一個人常常有好幾個不同銀行的帳戶。如果直接照帳戶原始文字分組，同一個人的錢會被
// 拆散成好幾組，看不出「誰要轉給誰」這種人與人之間的關係（例如婉亭要給雅婷、
// 雅婷也要給婉亭，這兩個方向要分開列出來，不能互相抵銷成一個淨額）。
// 所以先把帳戶文字反查出「實際收款的人」（比對已知的廠商名字是不是這個帳戶文字的開頭），
// 再依這個人分組；同一個人自己的單據（錢本來就是自己的）不算轉帳，跳過不列。
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
    return NextResponse.json({ holders: [], netSettlements: [], totals: { vendorProfitTotal: 0, platformFeeTotal: 0, count: 0, vendorTotals: [] } })
  }

  const vendorIds = [...new Set(rows.map((b) => b.vendorId).filter((v): v is string => !!v))]
  const months = [...new Set(rows.map((b) => b.soldDate?.slice(0, 7)).filter((m): m is string => !!m))]
  const allVendors = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
  const [vendorRateMap] = await Promise.all([
    getVendorPlatformFeeRatesForMonths(vendorIds, months),
  ])
  const vendorNameById = new Map(allVendors.map((v) => [v.id, v.name || v.email]))

  // 用來反查帳戶文字開頭是哪個人：只比對有名字的帳號，由長到短比對，
  // 避免短名字誤判（例如某人名字剛好是另一個人名字的前綴）
  const knownNames = [...new Set(allVendors.map((v) => v.name).filter((n): n is string => !!n))].sort((a, b) => b.length - a.length)
  function extractHolder(account: string): string {
    const hit = knownNames.find((n) => account.startsWith(n))
    return hit ?? account
  }

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

  // 依「收款人」分組（不是依帳戶原始文字），組內列出要轉給誰、多少錢——
  // 自己轉給自己的（收款人剛好就是這張單的廠商，或收款人剛好就是雅婷本人）不算轉帳，跳過。
  type TransferLine = { to: string; amount: number }
  type HolderGroup = { holder: string; bookings: SettlementRow[]; transfers: Map<string, TransferLine> }
  const holderMap = new Map<string, HolderGroup>()
  for (const d of detail) {
    const holder = extractHolder(d.account)
    const group: HolderGroup = holderMap.get(holder) ?? { holder, bookings: [], transfers: new Map() }
    group.bookings.push(d)

    if (d.vendorName !== holder && d.vendorProfit !== 0) {
      const line = group.transfers.get(d.vendorName) ?? { to: d.vendorName, amount: 0 }
      line.amount += d.vendorProfit
      group.transfers.set(d.vendorName, line)
    }
    if (holder !== PLATFORM_FEE_RECIPIENT && d.platformFee !== 0) {
      const line = group.transfers.get(PLATFORM_FEE_RECIPIENT) ?? { to: PLATFORM_FEE_RECIPIENT, amount: 0 }
      line.amount += d.platformFee
      group.transfers.set(PLATFORM_FEE_RECIPIENT, line)
    }
    holderMap.set(holder, group)
  }

  const holders = [...holderMap.values()].map((group) => ({
    holder: group.holder,
    bookings: group.bookings.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate)),
    transfers: [...group.transfers.values()].sort((a, b) => b.amount - a.amount),
  })).sort((a, b) => a.holder.localeCompare(b.holder))

  // 淨額結算：同一對人之間如果兩個方向都有轉帳（例如婉亭要給雅婷 20500，雅婷也要給婉亭 10240），
  // 互相抵銷成一筆淨額（婉亭 → 雅婷 10260），這樣每一對人只要轉一次錢，不用來回轉兩次。
  const pairAmounts = new Map<string, number>() // key: "A|B" 表示 A 要轉給 B 的（未抵銷）金額
  for (const group of holderMap.values()) {
    for (const line of group.transfers.values()) {
      const key = `${group.holder}|${line.to}`
      pairAmounts.set(key, (pairAmounts.get(key) ?? 0) + line.amount)
    }
  }
  const seenPairs = new Set<string>()
  const netSettlements: { from: string; to: string; amount: number }[] = []
  for (const key of pairAmounts.keys()) {
    const [a, b] = key.split('|')
    const pairKey = [a, b].sort().join('|')
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    const aToB = pairAmounts.get(`${a}|${b}`) ?? 0
    const bToA = pairAmounts.get(`${b}|${a}`) ?? 0
    const net = aToB - bToA
    if (net > 0) netSettlements.push({ from: a, to: b, amount: net })
    else if (net < 0) netSettlements.push({ from: b, to: a, amount: -net })
  }
  netSettlements.sort((a, b) => b.amount - a.amount)

  const totals = detail.reduce(
    (acc, d) => ({ vendorProfitTotal: acc.vendorProfitTotal + d.vendorProfit, platformFeeTotal: acc.platformFeeTotal + d.platformFee, count: acc.count + 1 }),
    { vendorProfitTotal: 0, platformFeeTotal: 0, count: 0 }
  )

  // 全月總計：不分帳戶/收款人，把同一個廠商全部加總成一個數字，
  // 跟平台費總額（歸雅婷）一起列成「總計轉帳指示」
  const grandVendorMap = new Map<string, { vendorName: string; amount: number }>()
  for (const d of detail) {
    const vKey = d.vendorId ?? 'none'
    const vTotal = grandVendorMap.get(vKey) ?? { vendorName: d.vendorName, amount: 0 }
    vTotal.amount += d.vendorProfit
    grandVendorMap.set(vKey, vTotal)
  }
  const vendorTotals = [...grandVendorMap.values()].sort((a, b) => b.amount - a.amount)

  return NextResponse.json({ holders, netSettlements, totals: { ...totals, vendorTotals } })
}
