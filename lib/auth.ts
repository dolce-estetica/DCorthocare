import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Clinic sign-in",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const username = String(creds?.username || "").trim().toUpperCase();
        const password = String(creds?.password || "");
        if (!username || !password) return null;
        const u = await prisma.user.findUnique({ where: { username } });
        if (!u || !u.active) return null;
        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return null;
        return { id: u.id, name: u.name, email: u.username, role: u.role } as any;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as any).role;
        token.username = (user as any).email;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      (session.user as any).role = token.role;
      (session.user as any).username = token.username;
      return session;
    },
  },
});
