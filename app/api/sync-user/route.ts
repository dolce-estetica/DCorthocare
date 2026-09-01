import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

/* The clinic app manages staff logins inside its own document (Doctors & Physios,
   Staff & Salary). When the owner saves a login there, the app calls this endpoint
   so the NextAuth gate account stays in step. Admin only. */
export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (s.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const b = await req.json().catch(() => null);
  const username = String(b?.username || "").trim().toUpperCase();
  const name = String(b?.name || username).trim();
  const role = ["ADMIN", "DOCTOR", "PHYSIO", "STAFF"].includes(b?.role) ? (b.role as Role) : "STAFF";
  const active = b?.active !== false;
  const password = String(b?.password || "");
  if (!username) return NextResponse.json({ error: "Username required." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing && !password)
    return NextResponse.json({ error: "Password required for a new account." }, { status: 400 });

  const passwordHash = password ? bcrypt.hashSync(password, 10) : existing!.passwordHash;

  await prisma.user.upsert({
    where: { username },
    update: { name, role, active, ...(password ? { passwordHash } : {}) },
    create: { username, name, role, active, passwordHash },
  });

  return NextResponse.json({ ok: true });
}
