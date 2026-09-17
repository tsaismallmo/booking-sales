import { NextRequest, NextResponse } from 'next/server'
import { eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, bookings, bookingRequests, smsLogs, vendorRosterEntries, vendorRosterLists, vendorPlatformRates, backups } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth-guard'
import { createSafetyBackup } from '@/lib/backup'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  if (!Array.isArray(body.roles) || body.roles.length === 0) {
    return NextResponse.json({ error: '至少要有一個角色' }, { status: 400 })
  }
  if (id === session.user.id && !body.roles.includes('admin')) {
    return NextResponse.json({ error: '不能移除自己的管理員角色，避免把自己鎖在外面' }, { status: 400 })
  }

  const [row] = await db
    .update(users)
    .set({
      name: body.name,
      roles: body.roles,
      employerVendorId: body.roles.includes('vendor_staff') ? body.employerVendorId || null : null,
    })
    .where(eq(users.id, id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('admin')
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: '不能刪除自己的帳號' }, { status: 400 })
  }

  // 刪帳號會連帶刪掉這個廠商底下的單據、名單等資料，屬於高風險操作——
  // 動手之前先自動存一份安全備份，萬一刪錯了還能整包還原回去。
  const [target] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id))
  await createSafetyBackup(`刪除帳號前自動備份（${target?.name || target?.email || id}）`)

  await db.delete(smsLogs).where(eq(smsLogs.createdById, id))
  await db.delete(bookingRequests).where(or(eq(bookingRequests.createdById, id), eq(bookingRequests.resolvedById, id)))
  await db.delete(bookings).where(or(eq(bookings.vendorId, id), eq(bookings.salespersonId, id)))
  await db.delete(vendorRosterEntries).where(eq(vendorRosterEntries.vendorId, id))
  await db.delete(vendorRosterLists).where(eq(vendorRosterLists.vendorId, id))
  await db.delete(vendorPlatformRates).where(eq(vendorPlatformRates.vendorId, id))
  await db.update(backups).set({ createdById: null }).where(eq(backups.createdById, id))
  await db.update(users).set({ employerVendorId: null }).where(eq(users.employerVendorId, id))
  await db.delete(users).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}
