import { pgTable, pgEnum, uuid, text, integer, numeric, date, timestamp, jsonb, unique, boolean, type AnyPgColumn } from 'drizzle-orm/pg-core'

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

// 餐廳／分店主檔：只有管理員能維護。單據用 branchId 指到分店，餐廳由分店推得。
// 不提供刪除只能停用——單據、備份快照都會指到這些 id，刪掉會讓舊資料或還原對不上。
export const restaurants = pgTable('restaurants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  cancelDaysBefore: integer('cancel_days_before').notNull().default(7), // 退訂期限＝訂位日期往前幾天（單據沒填退訂期限時自動算）
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const branches = pgTable('branches', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique('branches_restaurant_name_unique').on(t.restaurantId, t.name)])

// 單據：廠商建立，客服銷售
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),

  // 基本資訊
  vendorId: uuid('vendor_id').references(() => users.id), // 訂單歸屬（客服自建的臨時單/預購單沒有廠商，可為空）
  branchId: uuid('branch_id').references(() => branches.id), // 分店（主檔），有選的話 branch 文字由伺服器自動寫成「餐廳｜分店」
  branch: text('branch'), // 分店顯示文字「餐廳｜分店」（列表、篩選、比對都用這個；舊資料或沒對到主檔的可能只有自由文字）
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
  depositDisbursed: boolean('deposit_disbursed').notNull().default(false), // 已撥款
  depositConfirmed: boolean('deposit_confirmed').notNull().default(false), // 確認收到款項
  actualBooker: text('actual_booker'), // 實際訂位人員（實際打電話/訂位的內部人員，可能跟付款人員、銷售的客服都不同）

  // 客戶端資訊
  customerName: text('customer_name'), // 姓名
  customerPhone: text('customer_phone'), // 電話
  source: text('source'), // 來源
  isInline: boolean('is_inline').notNull().default(false), // 是否為 Inline 訂位（明確勾選，取代之前用「來源」文字猜的做法）
  isEztable: boolean('is_eztable').notNull().default(false), // 是否為 EZTABLE 訂位（明確勾選，取代之前用訂位代號長度猜的做法）

  // 銷售/收款
  soldDate: date('sold_date'), // 售出日期
  collectedAmount: numeric('collected_amount'), // 收款金額
  account: text('account'), // 帳戶
  salespersonId: uuid('salesperson_id').references(() => users.id), // 銷售（客服）
  agencyFee: numeric('agency_fee'), // 代訂費（全座正常費用）
  soldCount: integer('sold_count'), // 實賣人數（若只賣出部分人數時填入，用於計算廠商利潤）
  platformFeeBase: numeric('platform_fee_base'), // 平台抽成的計費基礎金額（留空就用代訂費全額算平台費；
  // 填了的話，超過這個金額的部分不抽平台費、直接算給廠商，例如代訂費1200只想拿900去算平台費，剩下300全給廠商）
  staffShareAmount: numeric('staff_share_amount'), // 廠商從自己的廠商利潤裡要分給「電話歸屬」（訂位電話/姓名所屬名單）那個人的金額（廠商/管理員自己填）
  bookerShareAmount: numeric('booker_share_amount'), // 廠商從自己的廠商利潤裡要分給「實際訂位人員」（actualBooker）的金額（廠商/管理員自己填）

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
  branchId: uuid('branch_id').references(() => branches.id), // 對應到的分店主檔
  canonicalBranch: text('canonical_branch').notNull(), // 對應到的「餐廳｜分店」文字（跟 branchId 同步）
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
  previousPartySize: integer('previous_party_size'), // 送出需求當下、改人數前的原始人數（proposedPartySize 有填才會存），用來在看板顯示「原X→現Y」

  createdById: uuid('created_by_id').references(() => users.id),
  resolvedById: uuid('resolved_by_id').references(() => users.id),
  resolvedByName: text('resolved_by_name'), // 實際處理的人員（自由輸入，可能跟登入帳號不是同一個人，例如共用登入帳號的情況）
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 訂位需求：客人要的日期／時段現貨單裡沒有符合的位子，客服登記下來，後勤去跟餐廳訂。
// 跟上面的 bookingRequests（已有單據要改內容）不同，這裡還沒有單據。
// 一個客人一筆需求，底下可以有多個候選日期（seatRequestOptions，依順位排、可以跨餐廳／分店）。
// status 是整筆需求的狀態：還有候選要訂就是 pending；全部處理完，有訂到算 booked、都沒訂到算 failed；客人不要了是 cancelled
export const seatRequestStatusEnum = pgEnum('seat_request_status', ['pending', 'booked', 'failed', 'cancelled'])
export const seatRequests = pgTable('seat_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  partySize: integer('party_size'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  note: text('note'), // 客服補充（例如可接受的時段範圍）
  status: seatRequestStatusEnum('status').notNull().default('pending'),
  resultNote: text('result_note'), // 取消／結束的原因
  createdById: uuid('created_by_id').references(() => users.id),
  handledById: uuid('handled_by_id').references(() => users.id),
  handledByName: text('handled_by_name'),
  handledAt: timestamp('handled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 訂位需求的候選日期：priority 1 是客人最想要的。
// skipped = 這個候選不訂了（已經訂到別的、或整筆需求結束）
export const seatRequestOptionStatusEnum = pgEnum('seat_request_option_status', ['pending', 'booked', 'failed', 'skipped'])
export const seatRequestOptions = pgTable('seat_request_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => seatRequests.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(1),
  branchId: uuid('branch_id').references(() => branches.id),
  branch: text('branch'), // 「餐廳｜分店」
  bookingDate: date('booking_date').notNull(),
  timeSlot: text('time_slot'),
  status: seatRequestOptionStatusEnum('status').notNull().default('pending'),
  bookingCode: text('booking_code'), // 後勤訂到後填的訂位代號
  resultNote: text('result_note'), // 訂不到的原因、實際訂到的時段等
  handledById: uuid('handled_by_id').references(() => users.id),
  handledByName: text('handled_by_name'),
  handledAt: timestamp('handled_at'),
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

// 客服分潤比例：全部客服共用同一個比例，但依月份各別設定（改某個月不會動到其他月份，
// 沒設定過的月份用預設 20%）。只有管理員能改。
export const csShareRates = pgTable('cs_share_rates', {
  month: text('month').primaryKey(), // 'YYYY-MM'
  csShareOfPlatformRate: integer('cs_share_of_platform_rate').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// 各廠商每個月各別的平台分潤費率：改某個月的費率不會動到其他月份，
// 沒設定過的月份用預設 20%。只有管理員能改。
export const vendorPlatformRates = pgTable('vendor_platform_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id').notNull().references(() => users.id),
  month: text('month').notNull(), // 'YYYY-MM'
  platformFeeRate: integer('platform_fee_rate').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.vendorId, table.month),
])

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

// 資料備份：管理員手動建立，把業務資料（不含帳號，避免還原時把自己的登入身份改掉）
// 整包存成一筆 JSON 快照，之後可以整包還原回去。
export const backups = pgTable('backups', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label'), // 備份備注（例如「改分潤設定前」），可留空
  data: jsonb('data').notNull(), // 快照內容：{ bookings: [...], bookingRequests: [...], ... }
  createdById: uuid('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
