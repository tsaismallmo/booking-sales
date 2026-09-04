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
    // 每次都用 email 重新查一次角色（不是只在登入當下查），
    // 這樣管理員改了角色會立刻生效，也不會因為 schema 改過、舊 token 沒有 roles 欄位而壞掉。
    async jwt({ token, user }) {
      const email = user?.email ?? token.email
      if (email) {
        const [account] = await db.select().from(users).where(eq(users.email, email))
        if (account) {
          token.userId = account.id
          token.roles = account.roles
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.roles) {
        session.user.id = token.userId
        session.user.roles = token.roles
      }
      return session
    },
  },
})
