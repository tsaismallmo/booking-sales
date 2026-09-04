import { pgTable, pgEnum, uuid, text, integer, numeric, date, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['admin', 'vendor', 'customer_service'])
export const bookingStatusEnum = pgEnum('booking_status', ['unsold', 'reserved', 'sold', 'refunded'])
export const bookingCategoryEnum = pgEnum('booking_category', ['預購單', '臨時單', '現貨單'])
export const smsTypeEnum = pgEnum('sms_type', ['booking_notice', 'payment_completion'])

// 帳號：管理員可以在後台新增/刪除、指定角色
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// 單據：廠商建立，客服銷售
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),

  // 基本資訊
  vendorId: uuid('vendor_id').notNull().references(() => users.id), // 訂單歸屬
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
  agencyFee: numeric('agency_fee'), // 代訂費

  // 其他
  info: text('info'), // 資訊（快速註記）
  note: text('note'), // 備註

  createdAt: timestamp('created_at').defaultNow().notNull(),
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
