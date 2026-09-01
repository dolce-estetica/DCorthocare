"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function addUser(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/clinic");
  const username = String(formData.get("username") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "STAFF");
  if (!username || !name || password.length < 6 || !["ADMIN", "DOCTOR", "PHYSIO", "STAFF"].includes(role)) return;
  const bcrypt = (await import("bcryptjs")).default;
  await prisma.user.create({
    data: { username, name, role: role as any, passwordHash: bcrypt.hashSync(password, 10) },
  });
  revalidatePath("/users");
}

export async function toggleUser(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/clinic");
  const id = String(formData.get("id") || "");
  if (!id || id === session.user.id) return;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/users");
}
