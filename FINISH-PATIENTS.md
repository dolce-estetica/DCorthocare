# Finish: Patients SL + Registered date columns (patch prepared, not yet applied)

The patch file `patch21.txt` is ready in this folder. Run these commands from the
project folder (`C:\Users\ASUS\.zcode\workspace\default\dc-ortho-care`):

1. Append the patch into the port pipeline:
   node -e "const fs=require('fs');let s=fs.readFileSync('scripts/port.js','utf8');const tail='fs.writeFileSync(OUT, html);\nconsole.log(\"clinic-app.html written:\", html.length, \"bytes\");';if(!s.includes(tail)){console.error('tail not found (maybe already appended)');process.exit(0);}const patch=fs.readFileSync('patch21.txt','utf8');s=s.replace(tail,patch+'\n'+tail);fs.writeFileSync('scripts/port.js',s);console.log('appended');"

2. Regenerate the app and syntax-check:
   node scripts/port.js
   node -e "const fs=require('fs');const m=fs.readFileSync('clinic-app.html','utf8').match(/<script>([\s\S]*)<\/script>/);fs.writeFileSync('appscript_check.js',m[1]);" && node --check appscript_check.js && rm appscript_check.js

3. Build and deploy:
   npm run build
   railway up --detach

4. Verify on https://dc-ortho-care-production.up.railway.app — Patients tab now
   shows SL (serial no), and a "Registered" date column (dmy of the patient's
   created date; shows — if a very old record has none).

Delete patch21.txt once applied. The patch adds two columns to the Patients
table only; nothing else is touched.
