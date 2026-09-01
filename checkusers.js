const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.user.findMany().then(us => { console.log(us.map(u => u.username + ":" + u.active).join(", ")); return p.$disconnect(); }).catch(e => { console.error("DBERR", e.message); process.exit(1); });
