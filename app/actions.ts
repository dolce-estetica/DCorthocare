"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function addPatient(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !phone) return;
  const ageRaw = String(formData.get("age") || "").trim();
  await prisma.patient.create({
    data: {
      name,
      phone,
      age: ageRaw ? Number(ageRaw) : null,
      gender: String(formData.get("gender") || "") || null,
      address: String(formData.get("address") || "").trim() || null,
    },
  });
  revalidatePath("/patients");
}

export async function addPayment(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const billId = String(formData.get("billId") || "");
  const amount = Number(formData.get("amount") || 0);
  const mode = String(formData.get("mode") || "CASH");
  if (!billId || !(amount > 0)) return;
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { payments: true } });
  if (!bill) return;
  const paid = bill.payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((bill.total - paid) * 100) / 100;
  if (amount > balance + 0.001) return;
  await prisma.payment.create({ data: { billId, amount: Math.min(amount, balance), mode: mode as any } });
  revalidatePath(`/bills/${billId}`);
  revalidatePath("/bills");
  revalidatePath("/dashboard");
}

export async function addUser(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
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
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  const id = String(formData.get("id") || "");
  if (!id || id === session.user.id) return;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/users");
}
