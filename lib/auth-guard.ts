import { auth } from '@/auth'
import type { Role } from '@/types/next-auth'

export async function requireRole(...roles: Role[]) {
  const session = await auth()
  if (!session?.user || !session.user.roles.some((r) => roles.includes(r))) return null
  return session
}
