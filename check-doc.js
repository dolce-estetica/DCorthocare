const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.appState.findUnique({ where: { id: "clinic" } }).then(row => {
  const d = row.data;
  console.log("doctors:", JSON.stringify((d.doctors||[]).map(x => ({ n: x.name, k: x.kind, login: x.login, u: x.user }))));
  console.log("staff:", JSON.stringify((d.staff||[]).map(x => ({ n: x.name, login: x.login, u: x.user }))));
  return p.$disconnect();
});
