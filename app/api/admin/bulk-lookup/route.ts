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
  customerRaw?: string // 姓名+電話合併欄位，比對時看是否包含資料庫的姓名
  deposit?: string
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
    status: bookings.status,
  }).from(bookings).where(inArray(bookings.bookingCode, codes))

  const results = items.map((item) => {
    let pool = rows

    // 逐步縮窄：每個欄位有值才過濾，取命中最多條件的結果
    if (item.code) pool = pool.filter((r) => r.bookingCode === item.code)

    // 用日期／分店／時段／人數／姓名／訂金一起比對；哪個欄位有提供就用哪個
    const byAll = pool.filter((r) => {
      if (item.date && r.bookingDate !== item.date) return false
      if (item.branch && r.branch !== item.branch) return false
      if (item.timeSlot && normaliseTime(r.timeSlot ?? '') !== normaliseTime(item.timeSlot)) return false
      if (item.partySize && r.partySize !== null && Number(item.partySize) !== r.partySize) return false
      if (item.customerRaw && r.customerName && !item.customerRaw.includes(r.customerName)) return false
      if (item.deposit && r.depositAmount !== null && !amountsMatch(item.deposit, r.depositAmount)) return false
      return true
    })

    // 如果多條件命中有結果就用，否則退回只用代號的結果
    const matches = byAll.length > 0 ? byAll : pool

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
