const fs = require("fs");
let s = fs.readFileSync("scripts/port.js", "utf8");
const tail = 'fs.writeFileSync(OUT, html);\nconsole.log("clinic-app.html written:", html.length, "bytes");';
if (!s.includes(tail)) { console.error("tail not found"); process.exit(1); }
const patch = fs.readFileSync("patch20.txt", "utf8");
s = s.replace(tail, patch + "\n" + tail);
fs.writeFileSync("scripts/port.js", s);
console.log("patch 20 appended");
