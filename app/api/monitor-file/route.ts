import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seatRequestOptions, seatRequests } from '@/lib/db/schema'
import { expirePastOptions } from '@/lib/seat-requests'
import { buildFeastFile, buildMonitorFile, type MonitorRequest } from '@/lib/monitor-files'

// 監控程式直接抓客人需求參數檔（不用再從需求看板下載）。
// 監控程式沒辦法登入，所以用 MONITOR_TOKEN 驗證：Authorization: Bearer <MONITOR_TOKEN>
// proxy.ts 放行這個路徑，驗證全在這裡；沒設 MONITOR_TOKEN 就一律拒絕。
// 只回傳參數檔那幾行（客人名字、分店、日期、餐期、人數；沒填名字的客人會用電話代替），唯讀。
//   GET /api/monitor-file?type=inline  → 島語 customers.txt
//   GET /api/monitor-file?type=feast   → 饗賓 feast_customers.txt

function authorized(req: NextRequest) {
  const expected = process.env.MONITOR_TOKEN
  if (!expected || expected.length < 32) return false
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  if (type !== 'inline' && type !== 'feast') {
    return NextResponse.json({ error: 'type 要是 inline 或 feast' }, { status: 400 })
  }

  // 跟需求看板一樣，先把日期已過的候選結束掉
  await expirePastOptions()

  const requests = await db
    .select({ id: seatRequests.id, customerName: seatRequests.customerName, customerPhone: seatRequests.customerPhone, status: seatRequests.status })
    .from(seatRequests)
    .where(eq(seatRequests.status, 'pending'))
  const ids = requests.map((r) => r.id)
  const options = ids.length === 0 ? [] : await db
    .select({ requestId: seatRequestOptions.requestId, branch: seatRequestOptions.branch, bookingDate: seatRequestOptions.bookingDate, timeSlot: seatRequestOptions.timeSlot, partySize: seatRequestOptions.partySize, status: seatRequestOptions.status })
    .from(seatRequestOptions)
    .where(inArray(seatRequestOptions.requestId, ids))

  const rows: MonitorRequest[] = requests.map((r) => ({
    ...r,
    options: options.filter((o) => o.requestId === r.id),
  }))
  const text = type === 'feast' ? buildFeastFile(rows) : buildMonitorFile(rows)

  return new NextResponse(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
