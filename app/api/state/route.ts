import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* The clinic app keeps its whole working state as one document.
   GET returns it (with its version stamp). PUT/POST apply a write only if the
   caller based it on the newest version — otherwise 409 + the fresh document,
   so one device can never silently erase another device's entries. */
export async function GET() {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const row = await prisma.appState.findUnique({ where: { id: "clinic" } });
  return NextResponse.json({
    doc: row?.data ?? null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  });
}

async function handleWrite(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const j = await req.json().catch(() => null);
  if (!j || !j.doc || typeof j.doc !== "object" || !j.doc.settings)
    return NextResponse.json({ error: "Bad state document." }, { status: 400 });

  const row = await prisma.appState.findUnique({ where: { id: "clinic" } });
  if (row) {
    /* TEMPORARY recovery window: accept un-versioned writes so a device running
       older app code can deliver trapped entries. Re-armed after recovery. */
    if (j.base && row.updatedAt.toISOString() > String(j.base)) {
      return NextResponse.json(
        { error: "Newer data saved from another device.", doc: row.data, updatedAt: row.updatedAt.toISOString() },
        { status: 409 }
      );
    }
  }
  const saved = await prisma.appState.upsert({
    where: { id: "clinic" },
    update: { data: j.doc },
    create: { id: "clinic", data: j.doc },
  });
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
}

export async function PUT(req: Request) {
  return handleWrite(req);
}

/* sendBeacon (used when the tab closes) can only send POST */
export async function POST(req: Request) {
  return handleWrite(req);
}
