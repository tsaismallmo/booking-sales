// 單據（bookings 表）在前端拿到的樣子：直接從資料庫 schema 推出來，欄位改了這裡會自動跟著變。
// API 用 NextResponse.json 回傳，所以資料庫裡的 Date（createdAt/updatedAt）到前端會變成字串；
// date 欄位（bookingDate 等）和 numeric 欄位（金額）drizzle 本來就給字串。
// 各頁面用 Pick<Booking, "id" | "branch" | ...> 挑自己用到的欄位就好，不要再自己抄一份。
import type { InferSelectModel } from 'drizzle-orm'
import type { bookings } from '@/lib/db/schema'

type Jsonify<T> = T extends Date ? string : T
type Row = InferSelectModel<typeof bookings>

export type Booking = { [K in keyof Row]: Jsonify<Row[K]> }
export type BookingStatus = Booking['status']
export type BookingCategory = Booking['category']
