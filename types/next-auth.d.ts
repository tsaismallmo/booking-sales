import { DefaultSession } from 'next-auth'

export type Role = 'admin' | 'vendor' | 'customer_service'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    role?: Role
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string
    role?: Role
  }
}
