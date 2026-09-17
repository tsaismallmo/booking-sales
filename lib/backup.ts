import { db } from '@/lib/db'
import {
  bookings, bookingRequests, vendorRosterLists, vendorRosterEntries,
  csShareRates, vendorPlatformRates, branchAliases, smsLogs, backups,
} from '@/lib/db/schema'

// 備份範圍：只備份業務資料，不含帳號（users）——還原時如果連帳號/角色都改回去，
// 有可能把當下操作的管理員自己的身份改掉，風險太高，所以帳號資料獨立管理、不進備份。
export async function snapshotAllTables() {
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

// 危險操作（例如刪帳號會連帶刪掉一堆資料）前先自動存一份現在狀態當安全網，
// createdById 給 null（不是操作者的手動備份，是系統自動保險用的）。
export async function createSafetyBackup(label: string) {
  const data = await snapshotAllTables()
  const [row] = await db.insert(backups).values({ label, data, createdById: null }).returning({ id: backups.id })
  return row.id
}
