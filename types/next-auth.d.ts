import { DefaultSession } from 'next-auth'

export type Role = 'admin' | 'vendor' | 'customer_service' | 'logistics' | 'vendor_staff'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: Role[]
      employerVendorId?: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    roles?: Role[]
    employerVendorId?: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string
    roles?: Role[]
    employerVendorId?: string | null
  }
}
