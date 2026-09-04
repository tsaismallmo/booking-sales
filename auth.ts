import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    // 只有存在帳號表裡的 email 才能登入（管理員在後台維護名單）
    async signIn({ user }) {
      if (!user.email) return false
      const [account] = await db.select().from(users).where(eq(users.email, user.email))
      return !!account
    },
    // 登入當下把角色寫進 token，之後每個 request 直接讀 token，不用再查資料庫
    async jwt({ token, user }) {
      if (user?.email) {
        const [account] = await db.select().from(users).where(eq(users.email, user.email))
        if (account) {
          token.userId = account.id
          token.role = account.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.role) {
        session.user.id = token.userId
        session.user.role = token.role
      }
      return session
    },
  },
})
