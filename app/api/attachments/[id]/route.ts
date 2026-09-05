import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* GET /api/attachments/<id>            -> inline preview
   GET /api/attachments/<id>?download=1 -> file download */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!s?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const disp = searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(a.data), {
    headers: {
      "content-type": a.mime || "application/octet-stream",
      "content-disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "cache-control": "private, max-age=3600",
    },
  });
}
