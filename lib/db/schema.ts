import { pgTable, pgEnum, uuid, text, integer, numeric, date, timestamp, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['admin', 'vendor', 'customer_service', 'logistics', 'vendor_staff'])
export const bookingStatusEnum = pgEnum('booking_status', ['unsold', 'reserved', 'sold', 'refunded'])
export const bookingCategoryEnum = pgEnum('booking_category', ['預購單', '臨時單', '現貨單', '預定單'])
export const smsTypeEnum = pgEnum('sms_type', ['booking_notice', 'payment_completion'])
export const requestStatusEnum = pgEnum('request_status', ['pending', 'resolved'])

// 帳號：管理員可以在後台新增/刪除、指定角色。一個帳號可以同時擁有多個角色。
// employerVendorId 只有「廠商員工」角色會用到，記錄這個員工是哪個廠商底下的，只能看那個廠商的資料。
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  roles: roleEnum('roles').array().notNull(),
  employerVendorId: uuid('employer_vendor_id').references((): AnyPgColumn => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 單據：廠商建立，客服銷售
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),

  // 基本資訊
  vendorId: uuid('vendor_id').references(() => users.id), // 訂單歸屬（客服自建的臨時單/預購單沒有廠商，可為空）
  branch: text('branch'), // 分店
  category: bookingCategoryEnum('category').notNull(), // 類別：預購單/臨時單/現貨單
  bookingDate: date('booking_date').notNull(), // 日期
  timeSlot: text('time_slot'), // 時段
  partySize: integer('party_size'), // 人數
  bookingCode: text('booking_code'), // 訂位代號

  // 訂位/退訂
  status: bookingStatusEnum('status').notNull().default('unsold'), // 狀態：未售出/訂/售/退
  cancelDeadline: date('cancel_deadline'), // 退訂期限
  paymentDeadline: date('payment_deadline'), // 付款期限（訂金簡訊裡的付款截止日）

  // 餐廳端金流
  depositAmount: numeric('deposit_amount'), // 訂金（廠商付給餐廳）
  depositPayer: text('deposit_payer'), // 付款人員（內部代繳訂金的人，通常是廠商本人）

  // 客戶端資訊
  customerName: text('customer_name'), // 姓名
  customerPhone: text('customer_phone'), // 電話
  source: text('source'), // 來源

  // 銷售/收款
  soldDate: date('sold_date'), // 售出日期
  collectedAmount: numeric('collected_amount'), // 收款金額
  account: text('account'), // 帳戶
  salespersonId: uuid('salesperson_id').references(() => users.id), // 銷售（客服）
  agencyFee: numeric('agency_fee'), // 代訂費（全座正常費用）
  soldCount: integer('sold_count'), // 實賣人數（若只賣出部分人數時填入，用於計算廠商利潤）

  // 其他
  info: text('info'), // 資訊（快速註記）
  note: text('note'), // 備註

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// 分店名稱對應：不同簡訊模板對同一間分店的寫法不一致（例如「漢來美食-島語-台北漢來店」
// vs「漢來島語台北店」），記錄「簡訊原文」對應到系統裡實際用的「分店名稱」，供比對時自動代換。
export const branchAliases = pgTable('branch_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  rawText: text('raw_text').notNull().unique(),
  canonicalBranch: text('canonical_branch').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 單據修改需求：客服在單據上發起「轉需求」，可以一次勾選多筆單據合併成一組（例如同一組客人拆開的
// 好幾筆），後勤人員（只處理臨時單/預定單）處理完成後，提議的欄位會自動套用回「全部」關聯的單據。
export const bookingRequests = pgTable('booking_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingIds: uuid('booking_ids').array().notNull(),
  status: requestStatusEnum('status').notNull().default('pending'),
  note: text('note'), // 客服說明要改什麼

  // 提議變更的欄位，只有要改的才會填值，套用時只覆蓋有填的欄位
  proposedBranch: text('proposed_branch'),
  proposedBookingDate: date('proposed_booking_date'),
  proposedTimeSlot: text('proposed_time_slot'),
  proposedPartySize: integer('proposed_party_size'),

  createdById: uuid('created_by_id').references(() => users.id),
  resolvedById: uuid('resolved_by_id').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 廠商名單清單：一個廠商可以建立多份命名清單（例如依用途分開管理），可排序。
// ownerEmail 只是標記這份清單算誰的（廠商本人或其員工），不影響誰看得到——
// 同一個廠商底下（廠商本人＋所有廠商員工）看得到彼此全部的清單。
export const vendorRosterLists = pgTable('vendor_roster_lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  ownerEmail: text('owner_email'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 廠商名單：廠商自己手上用來訂位的一批客戶身份（姓名/電話），拿去 Inline/EZTABLE 等平台訂位用。
// 只屬於建立它的廠商，其他廠商看不到彼此的名單；每筆一定歸屬某一份清單（vendorRosterLists）。
export const vendorRosterEntries = pgTable('vendor_roster_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id').notNull().references(() => users.id),
  listId: uuid('list_id').notNull().references(() => vendorRosterLists.id),
  name: text('name').notNull(),
  phone: text('phone'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 客服分潤全域設定：只有一筆（key='global'），全部客服共用同一個比例，只有管理員能改。
// csShareOfPlatformRate：客服從平台費裡再抽的比例（%），不影響廠商的部分。
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey().default('global'),
  csShareOfPlatformRate: integer('cs_share_of_platform_rate').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// 各廠商的平台分潤費率：平台費率（%）依廠商各別設定，廠商拿剩下的。只有管理員能改。
export const vendorPlatformRates = pgTable('vendor_platform_rates', {
  vendorId: uuid('vendor_id').primaryKey().references(() => users.id),
  platformFeeRate: integer('platform_fee_rate').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// 簡訊留存：付款通知／付款完成簡訊原文，留存並可連結到對應單據
export const smsLogs = pgTable('sms_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: smsTypeEnum('type').notNull(),
  rawText: text('raw_text').notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  parsedData: jsonb('parsed_data'),
  createdById: uuid('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
