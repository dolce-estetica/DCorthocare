const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const row = await p.appState.findUnique({ where: { id: "clinic" } });
  const d = row.data;
  console.log("server doc last written:", row.updatedAt.toISOString());
  console.log("nibin in patients:", JSON.stringify((d.patients||[]).filter(x=>/nibin/i.test(x.name||""))));
  console.log("nibin in bills:", JSON.stringify((d.bills||[]).filter(b=>/nibin/i.test(b.pname||"")).map(b=>({no:b.no,pname:b.pname,net:b.net,created:b.created}))));
  console.log("recent log:");
  (d.log||[]).slice(-10).forEach(l=>console.log(" ", l.ts, "|", (l.uname||"?").slice(0,15), "|", (l.summary||"").slice(0,60)));
  const n = await p.user.findMany({ where: { active: true }, select: { username: true, role: true } });
  console.log("gate accounts:", JSON.stringify(n));
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
