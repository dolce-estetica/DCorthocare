/* Port the ORIGINAL single-file app verbatim, with surgical patches:
   1. Postgres sync bridge (cloudPush/pullCloud) around load/save/saveNow
   2. NextAuth auto-login (window.__NA_USER__ injected per request)
   3. Discount toggle ₹ / % in the bill cart
   4. Owner-only link to the server-side Admin Dashboard
Every replacement asserts its expected occurrence count — a silent no-op fails the build. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "legacy", "DC_Ortho_Care_v4.1_original.html");
const OUT = path.join(__dirname, "..", "clinic-app.html");
let html = fs.readFileSync(SRC, "utf8");

function rep(oldStr, newStr, expect) {
  let n = 0;
  let idx = 0;
  while ((idx = html.indexOf(oldStr, idx)) !== -1) { n++; idx += oldStr.length; }
  if (n !== expect) {
    console.error(`PATCH FAIL: expected ${expect} occurrence(s), found ${n} for:\n${oldStr.slice(0, 120)}...`);
    process.exit(1);
  }
  html = html.split(oldStr).join(newStr);
}

/* ---- 1. cart: add disc mode fields (3 CART literals) ---- */
rep("disc:0,discReason:''", "disc:0,discMode:'rs',discPct:0,discReason:''", 3);

/* ---- 2. cartDisc helper ---- */
rep(
  "function drawCart(){",
  `function cartDisc(gross){
  if(CART.discMode==='pct'){return Math.min(R(gross*Math.min(100,Math.max(0,+CART.discPct||0))/100),gross);}
  return Math.min(R(CART.disc||0),gross);
}
function drawCart(){`,
  1
);

/* ---- 3. use it in drawCart + saveBill ---- */
rep(
  "const disc=Math.min(R(CART.disc||0),gross), net=R(gross-disc);",
  "const disc=cartDisc(gross), net=R(gross-disc);",
  1
);
rep(
  "const disc=Math.min(R(CART.disc||0),gross);",
  "const disc=cartDisc(gross);",
  1
);

/* ---- 4. discount row: ₹ / % toggle ---- */
rep(
  `'<div class="tot"><span>Discount</span><span><input type="number" min="0" value="'+(CART.disc||0)+'" oninput="CART.disc=+this.value;drawCart()" style="width:110px;text-align:right;padding:5px 8px"></span></div>'+`,
  `'<div class="tot"><span>Discount</span><span class="row" style="gap:6px;justify-content:flex-end">'+
     '<span class="pill'+(CART.discMode!=='pct'?' on':'')+'" onclick="CART.discMode=\\'rs\\';drawCart()">₹</span>'+
     '<span class="pill'+(CART.discMode==='pct'?' on':'')+'" onclick="CART.discMode=\\'pct\\';drawCart()">%</span>'+
     (CART.discMode==='pct'
       ?'<input type="number" min="0" max="100" value="'+(CART.discPct||0)+'" oninput="CART.discPct=+this.value;drawCart()" style="width:84px;text-align:right;padding:5px 8px"><span style="font-size:12px;color:var(--ink3)">%</span>'
       :'<input type="number" min="0" value="'+(CART.disc||0)+'" oninput="CART.disc=+this.value;drawCart()" style="width:110px;text-align:right;padding:5px 8px">')+
   '</span></div>'+
   (CART.discMode==='pct'&&(cartDisc(gross)>0)?'<div class="hint" style="text-align:right;margin-top:-4px">= '+money(cartDisc(gross))+' off</div>':'')+`,
  1
);

/* ---- 5. cloud bridge functions + boot changes ---- */
rep(
  "function saveNow(){clearTimeout(_saveT);try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}}",
  `function saveNow(){clearTimeout(_saveT);try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}cloudPush();}`,
  1
);
rep(
  `catch(e){toast('Could not save — browser storage full. Take a backup!','bad');}
},80);}`,
  `catch(e){toast('Could not save — browser storage full. Take a backup!','bad');}
  cloudPush();
},80);}`,
  1
);
rep(
  "function boot(){\n  load();\n  if(DB.settings.pinLock!==false)lockScreen();",
  `function boot(){
  load();
  pullCloud();
  const na=window.__NA_USER__;
  if(na&&na.username){autoLogin(na);return;}
  if(DB.settings.pinLock!==false)lockScreen();`,
  1
);
rep(
  "function boot2(){\n  const h=",
  "function boot2(){window.__IN__=true;\n  const h=",
  1
);
rep(
  "window.addEventListener('beforeunload',saveNow);",
  "window.addEventListener('beforeunload',function(){window.__BEACON__=true;saveNow();});",
  1
);
rep(
  "document.addEventListener('DOMContentLoaded',boot);",
  `/* ===== server sync bridge (PostgreSQL) ===== */
window.__CLOUD_READY__=false;window.__CLOUD_DIRTY__=false;
function cloudPush(){
  if(!window.__CLOUD_READY__){window.__CLOUD_DIRTY__=true;return;}
  try{
    const body=JSON.stringify({doc:DB});
    if(window.__BEACON__&&navigator.sendBeacon){navigator.sendBeacon('/api/state',new Blob([body],{type:'application/json'}));window.__BEACON__=false;return;}
    fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:body,keepalive:true}).catch(()=>{});
  }catch(e){}
}
function pullCloud(){
  fetch('/api/state').then(r=>r.ok?r.json():null).then(j=>{
    if(j&&j.doc&&j.doc.settings){DB=j.doc;migrate();
      try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}}
    window.__CLOUD_READY__=true;
    if(window.__CLOUD_DIRTY__){window.__CLOUD_DIRTY__=false;cloudPush();}
    if(window.__IN__){try{nav();go(CUR);}catch(e){}}
  }).catch(()=>{window.__CLOUD_READY__=true;
    if(window.__CLOUD_DIRTY__){window.__CLOUD_DIRTY__=false;cloudPush();}});
}
function autoLogin(na){
  const hit=allUsers().find(x=>String(x.user||'').trim().toUpperCase()===String(na.username).toUpperCase());
  if(hit){USER={id:hit.id,name:hit.name,role:hit.role,kind:hit.kind||'',perms:hit.perms};boot2();return;}
  if(DB.settings.pinLock!==false){lockScreen();return;}
  USER={id:'owner',name:DB.settings.ownerName||'Owner',role:'owner',perms:null};boot2();
}
window.__NA_USER__=__NA_USER_JSON__;
document.addEventListener('DOMContentLoaded',boot);`,
  1
);

/* ---- 6. owner-only Admin Dashboard link in the sidebar ---- */
rep(
  `+badge+'</div>';}).join('');`,
  `+badge+'</div>';}).join('')+(g[0]==='REVIEW'&&isOwner()?'<div class="navgrp">ADMIN</div><div class="navi" onclick="location.href=\\'/admin\\'"><span class="ic">📈</span>Admin Dashboard</div>':'');`,
  1
);

/* ---- 7. lock-screen footer text ---- */
rep(
  "Data is stored on this device only.</div>'",
  "Data is stored centrally · PostgreSQL.</div>'",
  1
);

fs.writeFileSync(OUT, html);
console.log("clinic-app.html written:", html.length, "bytes");
