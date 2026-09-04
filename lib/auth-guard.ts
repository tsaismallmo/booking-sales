import { auth } from '@/auth'
import type { Role } from '@/types/next-auth'

export async function requireRole(...roles: Role[]) {
  const session = await auth()
  if (!session?.user || !roles.includes(session.user.role)) return null
  return session
}
