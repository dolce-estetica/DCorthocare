const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const row = await p.appState.findUnique({ where: { id: "clinic" } });
  const d = row.data;
  console.log("doc last written:", row.updatedAt.toISOString(), "(IST:", row.updatedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), ")");
  console.log("patients:", JSON.stringify((d.patients || []).map(x => x.name)));
  console.log("bills:", (d.bills || []).length, "| visits:", (d.visits || []).length, "| services:", (d.services || []).length, "| stockItems:", (d.stockItems || []).length, "| expenses:", (d.expenses || []).length);
  const lastLog = (d.log || []).slice(-1)[0];
  console.log("last logged action:", lastLog ? lastLog.ts + " — " + (lastLog.summary || "").slice(0, 50) : "none");
  const atts = await p.attachment.findMany({ select: { id: true, filename: true, mime: true, size: true, expenseId: true, createdAt: true } });
  console.log("=== ATTACHMENT TABLE (files are stored separately — check if these survived) ===");
  console.log(JSON.stringify(atts.map(a => ({ file: a.filename, mime: a.mime, size: a.size, expenseId: a.expenseId, at: a.createdAt.toISOString() })), null, 1));
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
