import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTotals, dayKey } from "@/lib/format";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const items: { serviceId: string; name: string; qty: number; rate: number; taxClass: string }[] = Array.isArray(body.items)
    ? body.items
        .filter((i: any) => i && i.name && Number(i.qty) > 0 && Number(i.rate) >= 0)
        .map((i: any) => ({ serviceId: i.serviceId, name: String(i.name), qty: Number(i.qty), rate: Number(i.rate), taxClass: i.taxClass || "exempt" }))
    : [];
  if (!items.length) return NextResponse.json({ error: "Bill needs at least one item." }, { status: 400 });

  const discountType: "NONE" | "PERCENT" | "AMOUNT" = ["NONE", "PERCENT", "AMOUNT"].includes(body.discountType)
    ? body.discountType
    : "NONE";
  const discountValue = Math.max(0, Number(body.discountValue) || 0);
  if (discountType === "PERCENT" && discountValue > 100)
    return NextResponse.json({ error: "Percentage discount cannot exceed 100%." }, { status: 400 });

  const t = computeTotals(items, discountType, discountValue);

  /* patient */
  let patientId: string | null = body.patientId || null;
  if (!patientId) {
    const np = body.newPatient;
    if (!np || !np.name || !np.phone)
      return NextResponse.json({ error: "Pick an existing patient or give new patient name + phone." }, { status: 400 });
    const existing = await prisma.patient.findFirst({ where: { phone: String(np.phone) } });
    if (existing) patientId = existing.id;
    else {
      const created = await prisma.patient.create({
        data: { name: String(np.name), phone: String(np.phone), age: np.age ? Number(np.age) : null, gender: np.gender || null },
      });
      patientId = created.id;
    }
  }
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 400 });

  const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
  if (!professional || !["DOCTOR", "PHYSIO", "ADMIN"].includes(professional.role) || !professional.active)
    return NextResponse.json({ error: "Pick a valid doctor / physiotherapist." }, { status: 400 });

  const payAmount = Math.min(t.total, Math.max(0, Number(body.payAmount) || 0));
  const payMode = ["CASH", "UPI", "CARD", "BANK"].includes(body.payMode) ? body.payMode : "CASH";

  const mk = dayKey(new Date()).slice(0, 7);
  const seq = await prisma.bill.count({ where: { billNo: { startsWith: `DCOC-${mk.replace("-", "")}-` } } });
  const billNo = `DCOC-${mk.replace("-", "")}-${String(seq + 1).padStart(3, "0")}`;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      patientId: patient.id,
      professionalId: professional.id,
      subtotal: t.subtotal,
      discountType,
      discountValue,
      discountAmount: t.discountAmount,
      taxAmount: t.taxAmount,
      total: t.total,
      notes: body.notes ? String(body.notes).slice(0, 300) : null,
      items: {
        create: items.map((i) => ({
          serviceId: i.serviceId,
          name: i.name,
          qty: i.qty,
          rate: i.rate,
          amount: Math.round(i.qty * i.rate * 100) / 100,
          taxClass: i.taxClass,
        })),
      },
      payments: payAmount > 0 ? { create: { amount: payAmount, mode: payMode } } : undefined,
    },
  });

  return NextResponse.json({ id: bill.id, billNo: bill.billNo, total: bill.total });
}
