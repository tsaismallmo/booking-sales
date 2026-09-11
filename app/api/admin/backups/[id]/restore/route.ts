import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  backups,
  bookings, bookingRequests, vendorRosterLists, vendorRosterEntries,
  csShareRates, vendorPlatformRates, branchAliases, smsLogs,
} from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'

type Snapshot = {
  bookings: (typeof bookings.$inferSelect)[]
  bookingRequests: (typeof bookingRequests.$inferSelect)[]
  vendorRosterLists: (typeof vendorRosterLists.$inferSelect)[]
  vendorRosterEntries: (typeof vendorRosterEntries.$inferSelect)[]
  csShareRates: (typeof csShareRates.$inferSelect)[]
  vendorPlatformRates: (typeof vendorPlatformRates.$inferSelect)[]
  branchAliases: (typeof branchAliases.$inferSelect)[]
  smsLogs: (typeof smsLogs.$inferSelect)[]
}

// 備份存進 jsonb 欄位時，timestamp 欄位（JS Date 物件）會被序列化成純文字的 ISO 字串；
// 還原時再塞回 insert 會因為 drizzle 的 timestamp 欄位預期收到 Date 物件而炸掉
// （PgTimestamp.mapToDriverValue 裡呼叫 value.toISOString()），所以要先把這些欄位轉回 Date。
// date 型別的欄位（bookingDate、soldDate 等）本來就是存純文字，不受影響、不用轉。
function reviveDates<T extends Record<string, unknown>>(rows: T[], fields: (keyof T)[]): T[] {
  return rows.map((row) => {
    const copy = { ...row }
    for (const field of fields) {
      const v = copy[field]
      if (typeof v === 'string') copy[field] = new Date(v) as T[keyof T]
    }
    return copy
  })
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

// neon-http 驅動不支援一般的 db.transaction；原本想用 db.batch 把整包刪除+還原包成一次
// atomic 請求，但實測資料量大（兩千多筆訂單）時 db.batch 會直接失敗（Neon 的 batch API
// 對總資料量/查詢數有隱性限制），所以改成一個一個 table 依序執行、每個 table 內分批
// insert（避免單一 SQL 語句參數太多）。這樣沒辦法做到「全部成功或全部失敗」的保證，
// 所以還原前一定先自動存一份「安全快照」，萬一還原中途失敗，還能用那份自動快照復原。
async function snapshotAllTables() {
  const [
    bookingsRows, bookingRequestsRows, vendorRosterListsRows, vendorRosterEntriesRows,
    csShareRatesRows, vendorPlatformRatesRows, branchAliasesRows, smsLogsRows,
  ] = await Promise.all([
    db.select().from(bookings),
    db.select().from(bookingRequests),
    db.select().from(vendorRosterLists),
    db.select().from(vendorRosterEntries),
    db.select().from(csShareRates),
    db.select().from(vendorPlatformRates),
    db.select().from(branchAliases),
    db.select().from(smsLogs),
  ])
  return {
    bookings: bookingsRows,
    bookingRequests: bookingRequestsRows,
    vendorRosterLists: vendorRosterListsRows,
    vendorRosterEntries: vendorRosterEntriesRows,
    csShareRates: csShareRatesRows,
    vendorPlatformRates: vendorPlatformRatesRows,
    branchAliases: branchAliasesRows,
    smsLogs: smsLogsRows,
  }
}

const CHUNK_SIZE = 300

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const [row] = await db.select().from(backups).where(eq(backups.id, id))
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const snapshot = row.data as Snapshot

  // 還原前自動存一份現在的狀態，當作安全網
  const safetyData = await snapshotAllTables()
  const [safetyBackup] = await db
    .insert(backups)
    .values({ label: `還原前自動備份（即將還原到「${row.label || row.id}」）`, data: safetyData, createdById: session.user.id })
    .returning({ id: backups.id })

  // 刪除順序：先刪有外鍵指向別的備份資料表的那邊（子表）
  await db.delete(smsLogs)
  await db.delete(vendorRosterEntries)
  await db.delete(bookingRequests)
  await db.delete(vendorPlatformRates)
  await db.delete(csShareRates)
  await db.delete(branchAliases)
  await db.delete(bookings)
  await db.delete(vendorRosterLists)

  // 新增順序：先還原被參照的父表，再還原參照別人的子表
  for (const part of chunk(reviveDates(snapshot.bookings, ['createdAt', 'updatedAt']), CHUNK_SIZE)) {
    await db.insert(bookings).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.vendorRosterLists, ['createdAt']), CHUNK_SIZE)) {
    await db.insert(vendorRosterLists).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.vendorRosterEntries, ['createdAt']), CHUNK_SIZE)) {
    await db.insert(vendorRosterEntries).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.bookingRequests, ['createdAt', 'resolvedAt']), CHUNK_SIZE)) {
    await db.insert(bookingRequests).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.vendorPlatformRates, ['updatedAt']), CHUNK_SIZE)) {
    await db.insert(vendorPlatformRates).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.csShareRates, ['updatedAt']), CHUNK_SIZE)) {
    await db.insert(csShareRates).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.branchAliases, ['createdAt']), CHUNK_SIZE)) {
    await db.insert(branchAliases).values(part)
  }
  for (const part of chunk(reviveDates(snapshot.smsLogs, ['createdAt']), CHUNK_SIZE)) {
    await db.insert(smsLogs).values(part)
  }

  return NextResponse.json({
    ok: true,
    safetyBackupId: safetyBackup.id,
    counts: {
      bookings: snapshot.bookings.length,
      bookingRequests: snapshot.bookingRequests.length,
      vendorRosterLists: snapshot.vendorRosterLists.length,
      vendorRosterEntries: snapshot.vendorRosterEntries.length,
      csShareRates: snapshot.csShareRates.length,
      vendorPlatformRates: snapshot.vendorPlatformRates.length,
      branchAliases: snapshot.branchAliases.length,
      smsLogs: snapshot.smsLogs.length,
    },
  })
}
