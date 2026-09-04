import { DefaultSession } from 'next-auth'

export type Role = 'admin' | 'vendor' | 'customer_service' | 'logistics'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: Role[]
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    roles?: Role[]
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string
    roles?: Role[]
  }
}
