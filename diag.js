const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.appState.findUnique({ where: { id: "clinic" } }).then(row => {
  const d = row.data;
  console.log("doc updatedAt (server):", row.updatedAt.toISOString());
  console.log("patients:", d.patients.length, "| bills:", d.bills.length, "| visits:", (d.visits||[]).length, "| stockItems:", d.stockItems.length);
  console.log("--- last 8 activity-log entries (who did what, and when) ---");
  (d.log||[]).slice(-8).reverse().forEach(l => console.log(l.ts, "|", l.uname, "|", l.act, l.ent, "|", (l.summary||"").slice(0,60)));
  console.log("--- newest 5 bills ---");
  (d.bills||[]).slice(-5).reverse().forEach(b => console.log(b.no, "|", b.pname, "| net", b.net, "| created", b.created || "?", "| by", b.by || "?"));
  return p.$disconnect();
});
