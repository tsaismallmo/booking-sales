import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, salesChannels, users } from '@/lib/db/schema'
import { auth } from '@/auth'
import { defaultCancelDeadline, listBranchOptions, resolveBranch } from '@/lib/branches'

type ImportRow = {
  vendorName: string
  status: string // '' | 'unsold' | 'sold' | 'refunded'
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
  platform: string // '' | 'eztable' | 'inline'
  soldDate: string
  collectedAmount: string
  account: string
  salespersonName: string
  agencyFee: string
  salesChannelId?: string | null // 銷售平台 id（前端已經照名稱對好），一定要是設定裡有的平台
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

// 只接受純數字（含小數），其餘視為無效
function parseAmount(raw: string): string | null {
  const s = raw?.trim() ?? ''
  return s && /^\d+(\.\d+)?$/.test(s) ? s : null
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

    // 訂單歸屬一定要是廠商帳號的名字：admin/客服可以指定任何廠商；純廠商只能是自己
    const vendorAccounts = (await db.select({ id: users.id, name: users.name, roles: users.roles }).from(users))
      .filter((u): u is { id: string; name: string; roles: typeof u.roles } => u.roles.includes('vendor') && !!u.name)
      .filter((u) => isAdmin || isCS || u.id === session.user.id)
    const vendorMap = new Map(vendorAccounts.map((v) => [v.name, v.id]))

    // 銷售平台：只接受存在的平台 id，其他都當預設平台
    const channelIds = new Set((await db.select({ id: salesChannels.id }).from(salesChannels)).map((c) => c.id))

    // 銷售人員（客服）用姓名比對帳號，不限角色，跟填名字建單的邏輯一樣
    const salespersonNames = [...new Set(rows.map((r) => r.salespersonName).filter(Boolean))]
    let salespersonMap = new Map<string, string>()
    if (salespersonNames.length > 0) {
      const spRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.name, salespersonNames))
      salespersonMap = new Map(spRows.filter((v): v is { id: string; name: string } => v.name !== null).map((v) => [v.name, v.id]))
    }

    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = []
    const branchOptions = await listBranchOptions()

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 1

      const vendorId = vendorMap.get(r.vendorName?.trim()) ?? null
      if (!vendorId) {
        errors.push(`第 ${rowNum} 行：訂單歸屬「${r.vendorName || '（空白）'}」不是${isAdmin || isCS ? '廠商' : '你自己'}的名字，已略過`)
        continue
      }
      if (!r.salesChannelId || !channelIds.has(r.salesChannelId)) {
        errors.push(`第 ${rowNum} 行：銷售平台不是設定裡有的平台，已略過`)
        continue
      }

      const bookingDate = normalizeDate(r.bookingDate)
      if (!bookingDate) {
        errors.push(`第 ${rowNum} 行：日期格式錯誤「${r.bookingDate}」`)
        continue
      }

      const depositAmount = parseAmount(r.depositAmount)
      if (r.depositAmount?.trim() && !depositAmount) {
        errors.push(`第 ${rowNum} 行（${r.bookingDate} ${r.bookingCode}）：訂金「${r.depositAmount}」非數字，已略過`)
      }

      const collectedAmount = parseAmount(r.collectedAmount)
      if (r.collectedAmount?.trim() && !collectedAmount) {
        errors.push(`第 ${rowNum} 行（${r.bookingDate} ${r.bookingCode}）：收款金額「${r.collectedAmount}」非數字，已略過`)
      }

      const agencyFee = parseAmount(r.agencyFee)
      if (r.agencyFee?.trim() && !agencyFee) {
        errors.push(`第 ${rowNum} 行（${r.bookingDate} ${r.bookingCode}）：代訂費「${r.agencyFee}」非數字，已略過`)
      }

      let salespersonId: string | null = null
      if (r.salespersonName) {
        salespersonId = salespersonMap.get(r.salespersonName) ?? null
        if (!salespersonId) {
          errors.push(`第 ${rowNum} 行：找不到銷售人員「${r.salespersonName}」`)
        }
      }

      const status = r.status === 'sold' || r.status === 'refunded' ? r.status : 'unsold'

      const resolvedBranch = await resolveBranch({ branch: r.branch }, branchOptions)
      values.push({
        vendorId,
        ...resolvedBranch,
        category: '現貨單' as const,
        bookingDate,
        timeSlot: r.timeSlot || null,
        partySize: r.partySize ? parseInt(r.partySize, 10) : null,
        bookingCode: r.bookingCode || null,
        customerName: r.customerName || null,
        customerPhone: r.customerPhone || null,
        depositAmount,
        depositPayer: r.depositPayer || null,
        cancelDeadline: normalizeDate(r.cancelDeadline) || (await defaultCancelDeadline(resolvedBranch.branchId, bookingDate, branchOptions)),
        status,
        isEztable: r.platform === 'eztable',
        isInline: r.platform === 'inline',
        soldDate: normalizeDate(r.soldDate) || null,
        collectedAmount,
        account: r.account || null,
        salespersonId,
        agencyFee,
        salesChannelId: r.salesChannelId,
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
