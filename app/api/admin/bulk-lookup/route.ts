import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings } from '@/lib/db/schema'
import { auth } from '@/auth'

type Item = {
  code?: string
  date?: string
  branch?: string
  timeSlot?: string
  partySize?: string
  customerName?: string   // 姓名（跟電話分開的獨立欄位，用於嚴格比對）
  customerPhone?: string  // 電話（跟姓名分開的獨立欄位，用於嚴格比對）
  customerRaw?: string    // 舊格式相容：姓名+電話合併在同一欄，姓名/電話沒分開時的備援比對（用 includes，不是精準比對）
  deposit?: string
  vendorId?: string // 訂單歸屬解析出來的廠商 id，避免不同廠商剛好用了相同訂位代號互相比對錯
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!session?.user || (!roles.includes('admin') && !roles.includes('customer_service'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body: { items: Item[] } = await req.json()
  const items: Item[] = body.items ?? []

  const codes = [...new Set(items.map((i) => i.code).filter((c): c is string => !!c))]
  if (codes.length === 0) return NextResponse.json([])

  // 一次撈出所有相關代號的單據
  const rows = await db.select({
    id: bookings.id,
    bookingCode: bookings.bookingCode,
    bookingDate: bookings.bookingDate,
    branch: bookings.branch,
    timeSlot: bookings.timeSlot,
    category: bookings.category,
    customerName: bookings.customerName,
    customerPhone: bookings.customerPhone,
    partySize: bookings.partySize,
    depositAmount: bookings.depositAmount,
    vendorId: bookings.vendorId,
    status: bookings.status,
    isInline: bookings.isInline,
    isEztable: bookings.isEztable,
  }).from(bookings).where(inArray(bookings.bookingCode, codes))

  const results = items.map((item) => {
    let pool = rows

    // 逐步縮窄：每個欄位有值才過濾，取命中最多條件的結果
    if (item.code) pool = pool.filter((r) => r.bookingCode === item.code)

    // 訂單歸屬（vendorId）是確定知道的事實，不是用來猜的軟條件，先強制縮窄，
    // 不然退回代號比對時會把別的廠商剛好用了相同訂位代號的單一起列出來、選錯廠商
    const vendorScopedPool = item.vendorId ? pool.filter((r) => r.vendorId === item.vendorId) : pool

    // 唯一鍵是「分店＋訂位代號＋日期＋時段＋人數＋姓名＋電話」七個欄位一起——
    // 訂位代號單獨並不是唯一的（不同廠商、甚至同一廠商不同天都可能重複用到同一個代號），
    // 這七個欄位齊全時要求「完全相等」才算同一筆，不做模糊比對；
    // 找不到就是真的找不到（不退回去用比較鬆的條件比對，避免選到別筆單據）。
    const hasFullKey = !!(item.branch && item.date && item.timeSlot && item.partySize && item.customerName && item.customerPhone)
    if (hasFullKey) {
      const strict = vendorScopedPool.filter((r) =>
        r.branch === item.branch &&
        r.bookingDate === item.date &&
        normaliseTime(r.timeSlot ?? '') === normaliseTime(item.timeSlot!) &&
        r.partySize === Number(item.partySize) &&
        r.customerName === item.customerName &&
        r.customerPhone === item.customerPhone
      )
      return {
        code: item.code ?? '',
        date: item.date ?? null,
        branch: item.branch ?? null,
        timeSlot: item.timeSlot ?? null,
        matches: strict,
        exactMatch: strict.length === 1,
      }
    }

    // 七個關鍵欄位沒有齊全（舊格式、姓名電話合併在同一欄等情況）：退回原本比較寬鬆的比對，
    // 用日期／分店／時段／人數／姓名／訂金一起比對；哪個欄位有提供就用哪個
    const byAll = vendorScopedPool.filter((r) => {
      if (item.date && r.bookingDate !== item.date) return false
      if (item.branch && r.branch !== item.branch) return false
      if (item.timeSlot && normaliseTime(r.timeSlot ?? '') !== normaliseTime(item.timeSlot)) return false
      if (item.partySize && r.partySize !== null && Number(item.partySize) !== r.partySize) return false
      if (item.customerRaw && r.customerName && !item.customerRaw.includes(r.customerName)) return false
      if (item.deposit && r.depositAmount !== null && !amountsMatch(item.deposit, r.depositAmount)) return false
      return true
    })

    // 如果多條件命中有結果就用，否則退回只用代號的結果（但還是限定在同一個廠商底下）
    const matches = byAll.length > 0 ? byAll : vendorScopedPool

    return {
      code: item.code ?? '',
      date: item.date ?? null,
      branch: item.branch ?? null,
      timeSlot: item.timeSlot ?? null,
      matches,
      exactMatch: byAll.length === 1,
    }
  })

  return NextResponse.json(results)
}

// 去掉時間格式差異：「11:30」「1130」「11：30」都視為相同
function normaliseTime(s: string) {
  return s.replace(/[：\s]/g, ':').replace(/^(\d{2})(\d{2})$/, '$1:$2')
}

// 去掉千分位逗號後比對金額數字
function amountsMatch(raw: string, dbValue: string) {
  const a = Number(raw.replace(/,/g, ''))
  const b = Number(dbValue)
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}
