import { eq } from 'drizzle-orm';
import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token }) {
      // Only on first sign-in does the token lack a userId; resolve it once
      // and cache it on the encrypted token so later requests skip the DB.
      if (!token.userId && token.email) {
        const [existing] = await db.select().from(users).where(eq(users.email, token.email));
        const user = existing ?? (await db.insert(users).values({ email: token.email }).returning())[0];
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === 'string') {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
