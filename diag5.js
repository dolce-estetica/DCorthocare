const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const row = await p.appState.findUnique({ where: { id: "clinic" } });
  const d = row.data;
  console.log("=== last 40 logged actions ===");
  (d.log||[]).slice(-40).forEach(l => console.log(l.ts, "|", (l.uname||"?").padEnd(12), "|", l.act, l.ent, "|", (l.summary||"").slice(0,55)));
  console.log("=== bills 0005-0010 ===");
  (d.bills||[]).filter(b => b.no && b.no >= "DCO/202627/0005").forEach(b =>
    console.log(b.no, "|", b.pname, "| net", b.net, "| created", b.created, "| by", b.by));
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
