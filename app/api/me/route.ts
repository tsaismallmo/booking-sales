import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ id: session.user.id, email: session.user.email, roles: session.user.roles })
}
