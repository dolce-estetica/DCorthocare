import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* The clinic app keeps its whole working state as one document. GET returns it,
   PUT stores it. Authenticated users only. */
export async function GET() {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const row = await prisma.appState.findUnique({ where: { id: "clinic" } });
  return NextResponse.json({ doc: row?.data ?? null, updatedAt: row?.updatedAt ?? null });
}

export async function PUT(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const j = await req.json().catch(() => null);
  if (!j || !j.doc || typeof j.doc !== "object" || !j.doc.settings)
    return NextResponse.json({ error: "Bad state document." }, { status: 400 });
  await prisma.appState.upsert({
    where: { id: "clinic" },
    update: { data: j.doc },
    create: { id: "clinic", data: j.doc },
  });
  return NextResponse.json({ ok: true });
}

/* sendBeacon (used when the tab closes) can only send POST */
export async function POST(req: Request) {
  return PUT(req);
}
