import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, users } from '@/lib/db/schema'
import { auth } from '@/auth'

type ImportRow = {
  vendorName: string
  branch: string
  bookingDate: string
  timeSlot: string
  partySize: string
  bookingCode: string
  customerName: string
  customerPhone: string
  depositAmount: string
  depositPayer: string
  cancelDeadline: string
}

function normalizeDate(raw: string): string {
  if (!raw) return ''
  // 去掉星期標注（週一～週日）及多餘空白
  const s = raw.trim().replace(/週[一二三四五六日]/g, '').trim()
  // YYYY/M/D 或 YYYY-M-D
  const full = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  // M/D（無年份，補 2026）
  const short = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (short) return `2026-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`
  // 4月23日（中文格式，補 2026）
  const chinese = s.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (chinese) return `2026-${chinese[1].padStart(2, '0')}-${chinese[2].padStart(2, '0')}`
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const roles = session?.user?.roles ?? []
    const isVendor = roles.includes('vendor')
    const isAdmin = roles.includes('admin')
    const isCS = roles.includes('customer_service')

    if (!session?.user || (!isVendor && !isAdmin && !isCS)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { rows }: { rows: ImportRow[] } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '沒有資料' }, { status: 400 })
    }

    // 廠商只能匯入自己的單；admin/客服才能用 vendorName 指定歸屬廠商
    let vendorMap = new Map<string, string>()
    if (isAdmin || isCS) {
      const names = [...new Set(rows.map((r) => r.vendorName).filter(Boolean))]
      if (names.length > 0) {
        const vendorRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.name, names))
        vendorMap = new Map(vendorRows.map((v) => [v.name, v.id]))
      }
    }

    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 1

      let vendorId: string | null
      if (isVendor && !isAdmin) {
        vendorId = session.user.id ?? null
      } else {
        vendorId = vendorMap.get(r.vendorName) ?? null
        if (r.vendorName && !vendorId) {
          errors.push(`第 ${rowNum} 行：找不到廠商「${r.vendorName}」`)
          continue
        }
      }

      const bookingDate = normalizeDate(r.bookingDate)
      if (!bookingDate) {
        errors.push(`第 ${rowNum} 行：日期格式錯誤「${r.bookingDate}」`)
        continue
      }

      // 只接受純數字（含小數）的 depositAmount，其餘當作 null 並留警告
      const rawDeposit = r.depositAmount?.trim() ?? ''
      const depositAmount = rawDeposit && /^\d+(\.\d+)?$/.test(rawDeposit) ? rawDeposit : null
      if (rawDeposit && !depositAmount) {
        errors.push(`第 ${rowNum} 行（${r.bookingDate} ${r.bookingCode}）：訂金「${rawDeposit}」非數字，已略過`)
      }

      values.push({
        vendorId,
        branch: r.branch || null,
        category: '現貨單' as const,
        bookingDate,
        timeSlot: r.timeSlot || null,
        partySize: r.partySize ? parseInt(r.partySize, 10) : null,
        bookingCode: r.bookingCode || null,
        customerName: r.customerName || null,
        customerPhone: r.customerPhone || null,
        depositAmount,
        depositPayer: r.depositPayer || null,
        cancelDeadline: normalizeDate(r.cancelDeadline) || null,
        status: 'unsold' as const,
      })
    }

    let inserted = 0
    for (const v of values) {
      try {
        await db.insert(bookings).values(v)
        inserted++
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr)
        errors.push(`寫入失敗（${v.bookingDate} ${v.bookingCode}）：${msg}`)
      }
    }

    return NextResponse.json({ inserted, errors })
  } catch (err) {
    console.error('[bulk import error]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ inserted: 0, errors: [`伺服器錯誤：${msg}`] }, { status: 500 })
  }
}
