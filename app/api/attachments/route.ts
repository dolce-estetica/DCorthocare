import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX = 5 * 1024 * 1024; // 5 MB per file

/* GET ?expenseId=…  -> metadata list for that expense
   GET ?id=…         -> the file bytes (inline preview; ?download=1 to download)
   POST (raw bytes; headers x-expense-id + x-filename) -> upload, max 5 MB
   DELETE ?id=…      -> remove (admin only) */
export async function GET(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id");
  if (id) {
    const a = await prisma.attachment.findUnique({ where: { id } });
    if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const disp = searchParams.get("download") ? "attachment" : "inline";
    return new Response(new Uint8Array(a.data), {
      headers: {
        "content-type": a.mime || "application/octet-stream",
        "content-disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "cache-control": "private, max-age=3600",
      },
    });
  }

  const expenseId = searchParams.get("expenseId");
  if (!expenseId) return NextResponse.json({ error: "expenseId required." }, { status: 400 });
  const rows = await prisma.attachment.findMany({
    where: { expenseId },
    select: { id: true, filename: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const expenseId = req.headers.get("x-expense-id");
  if (!expenseId) return NextResponse.json({ error: "expenseId required." }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "Empty file." }, { status: 400 });
  if (buf.length > MAX) return NextResponse.json({ error: "File exceeds 5 MB." }, { status: 413 });

  const filename = decodeURIComponent(req.headers.get("x-filename") || "attachment");
  const mime = (req.headers.get("content-type") || "application/octet-stream").split(";")[0];

  const a = await prisma.attachment.create({
    data: { expenseId, filename, mime, size: buf.length, data: new Uint8Array(buf) },
  });
  return NextResponse.json({ ok: true, id: a.id, size: a.size });
}

export async function DELETE(req: Request) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (s.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  await prisma.attachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
