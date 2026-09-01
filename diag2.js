const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const row = await p.appState.findUnique({ where: { id: "clinic" } });
  const d = row.data;
  const lastLog = (d.log||[]).slice(-1)[0];
  console.log("== SERVER STATE ==");
  console.log("doc last written (updatedAt):", row.updatedAt.toISOString(), "(IST:", row.updatedAt.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}), ")");
  console.log("last logged user action    :", lastLog ? lastLog.ts + " — " + lastLog.uname + " — " + (lastLog.summary||"").slice(0,60) : "none");
  console.log("bills:", d.bills.length, "| patients:", d.patients.length, "| doctors:", d.doctors.length, "| staff:", d.staff.length);
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
