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
  clearTimeout(window.__CLOUD_T);window.__CLOUD_T=setTimeout(cloudPush,900);
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
  "window.addEventListener('beforeunload',function(){window.__BEACON__=true;saveNow();});\ndocument.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){window.__BEACON__=true;saveNow();}});",
  1
);
rep(
  "document.addEventListener('DOMContentLoaded',boot);",
  `/* ===== server sync bridge (PostgreSQL) ===== */
window.__CLOUD_READY__=false;window.__CLOUD_DIRTY__=false;
function cloudStatus(txt){const f=document.querySelector('#side .foot');if(f)f.innerHTML=txt;}
function cloudPush(){
  if(!window.__CLOUD_READY__){window.__CLOUD_DIRTY__=true;return;}
  try{
    const body=JSON.stringify({doc:DB});
    const done=function(){window.__CLOUD_FAILS=0;window.__CLOUD_DIRTY__=false;
      cloudStatus('Saved to server · '+new Date().toTimeString().slice(0,5)+'<br>Take a backup every Friday.');};
    if(window.__BEACON__&&navigator.sendBeacon){navigator.sendBeacon('/api/state',new Blob([body],{type:'application/json'}));window.__BEACON__=false;done();return;}
    fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:body,keepalive:true})
      .then(function(r){if(!r.ok)throw 0;done();})
      .catch(function(){
        window.__CLOUD_FAILS=(window.__CLOUD_FAILS||0)+1;
        if(window.__CLOUD_FAILS===1)toast('Could not reach the server — your work is safe on this device and will sync automatically.','warn');
        cloudStatus('Offline — changes kept on this device,<br>will sync automatically.');
        window.__CLOUD_DIRTY__=true;
        setTimeout(function(){if(window.__CLOUD_DIRTY__&&window.__CLOUD_READY__)cloudPush();},5000);});
  }catch(e){}
}
function pullCloud(){
  fetch('/api/state').then(r=>r.ok?r.json():null).then(j=>{
    if(j&&j.doc&&j.doc.settings){DB=j.doc;migrate();
      try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}}
    window.__CLOUD_READY__=true;
    cloudStatus('Connected · central PostgreSQL<br>Take a backup every Friday.');
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

/* ---- 8. sidebar footer text ---- */
rep(
  "Data stays in this browser.<br>Take a backup every Friday.",
  "Data stored centrally · PostgreSQL.<br>Take a backup every Friday.",
  1
);

/* ---- 9. sign out must also end the NextAuth session, not just reload ---- */
rep(
  "function signOut(){location.reload();}",
  `async function signOut(){
  try{
    const csrf=await fetch('/api/auth/csrf').then(r=>r.json());
    await fetch('/api/auth/signout',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({csrfToken:csrf.csrfToken,callbackUrl:'/login'})});
  }catch(e){}
  try{localStorage.removeItem(KEY);}catch(e){}
  location.href='/login';
}`,
  1
);

/* ---- 10. never display the default credentials on the hosted lock screen ---- */
rep(
  `      (dflt?'<div class="firsttime">First time on this device?<br>'+
        'Username <b>DCORTHO</b> &nbsp;·&nbsp; Password <b>DC@1234</b>'+
        '<button class="btn ghost sm" id="fillit" style="margin-top:9px">Fill it in for me</button></div>':'')+`,
  `      '<div class="firsttime">Sign in with your clinic account.<br>If you forgot it, ask the admin.</div>'+`,
  1
);
rep(
  `  if(dflt)$('#fillit').onclick=()=>{$('#uin').value='DCORTHO';$('#pin').value='DC@1234';$('#pinerr').textContent='';$('#signin').focus();};`,
  ``,
  1
);

/* ---- 11. Purchase entry: create a brand-new item inline ---- */
rep(
  `    '<div class="f"><label>Item</label><select id="pu_i">'+opt(DB.stockItems,'','id','name')+'</select></div>'+`,
  `    '<div class="f"><label>Item</label><select id="pu_i" onchange="puNewItem()">'+opt(DB.stockItems,'','id','name')+'<option value="__new">＋ New item — type the name below</option></select></div>'+
    '<div class="f" id="pu_ni_f" style="display:none"><label>New item name</label><input type="text" id="pu_ni" placeholder="e.g. Tab Paracetamol 500mg"></div>'+
    '<div class="f" id="pu_nu_f" style="display:none"><label>Unit (strip / bottle / no)</label><input type="text" id="pu_nu" value="no"></div>'+`,
  1
);
rep(
  `  $('#pu_ok').onclick=()=>{
    const itemId=$('#pu_i').value,q=R($('#pu_q').value),a=R($('#pu_a').value),d=$('#pu_d').value;`,
  `  $('#pu_ok').onclick=()=>{
    let itemId=$('#pu_i').value;
    if(itemId==='__new'){
      const nm=String($('#pu_ni').value||'').trim();
      if(!nm){toast('Type the new item name first','warn');return;}
      const o={id:uid(),name:nm,cat:'Medicines',unit:String($('#pu_nu').value||'').trim()||'no',rate:0,min:2,opening:0};
      DB.stockItems.push(o);itemId=o.id;
    }
    const q=R($('#pu_q').value),a=R($('#pu_a').value),d=$('#pu_d').value;`,
  1
);
rep(
  "function purchaseForm(){",
  `function puNewItem(){
  const nw=$('#pu_i').value==='__new';
  $('#pu_ni_f').style.display=nw?'':'none';
  $('#pu_nu_f').style.display=nw?'':'none';
  if(nw)setTimeout(function(){var e=$('#pu_ni');if(e)e.focus();},50);
}
function purchaseForm(){`,
  1
);

/* ---- 12. rx: show live stock, block out-of-stock medicines, cap quantities ---- */
rep(
  `    '<td style="width:17%;font-size:11.5px"><label style="margin:0;font-weight:600"><input type="checkbox" style="width:auto"'+(m.dispense?' checked':'')+' onchange="rxSet('+i+',\\'dispense\\',this.checked)"> Give from clinic</label></td>'+`,
  `    '<td style="width:17%;font-size:11.5px"><label style="margin:0;font-weight:600"><input type="checkbox" style="width:auto"'+(m.dispense?' checked':'')+' onchange="rxSet('+i+',\\'dispense\\',this.checked)"> Give from clinic</label>'+
    (function(){const it=DB.stockItems.find(function(x){return x.id===m.itemId;})||DB.stockItems.find(function(x){return x.name&&x.name.toLowerCase()===String(m.name||'').toLowerCase();});
      if(!it)return '';const q=stockQty(it.id);
      return '<div style="margin-top:2px;font-weight:700;font-size:11px;color:'+(q>0?'var(--ok)':'var(--bad)')+'">'+(q>0?(q+' '+esc(it.unit||'pcs')+' in stock'):'not in stock (0)')+'</div>';})()+'</td>'+`,
  1
);
rep(
  `function rxSet(i,k,val){const v=visitById(CV);v.meds[i][k]=val;
  if(k==='name'){const it=DB.stockItems.find(x=>x.name.toLowerCase()===String(val).toLowerCase());v.meds[i].itemId=it?it.id:'';}
  save();}`,
  `function rxSet(i,k,val){const v=visitById(CV);v.meds[i][k]=val;
  if(k==='name'){
    const it=DB.stockItems.find(x=>x.name.toLowerCase()===String(val).toLowerCase());
    if(it){
      const q=stockQty(it.id);
      if(q<=0){toast(it.name+' — not in stock ('+q+' '+(it.unit||'pcs')+' in clinic). Buy it first, or write it as an outside medicine.','bad');
        v.meds[i].name='';v.meds[i].itemId='';save();drawRx();return;}
      toast(it.name+': '+q+' '+(it.unit||'pcs')+' in stock','ok');
    }
    v.meds[i].itemId=it?it.id:'';
  }
  if(k==='qty'&&v.meds[i].dispense&&v.meds[i].itemId){
    const it2=DB.stockItems.find(x=>x.id===v.meds[i].itemId);
    if(it2){const q2=stockQty(it2.id);
      if((+val||0)>q2){v.meds[i].qty=q2;save();drawRx();
        toast('Only '+q2+' '+(it2.unit||'pcs')+' of '+it2.name+' in stock — quantity capped','warn');return;}}}
  if(k==='dispense'&&val&&v.meds[i].itemId){
    const it3=DB.stockItems.find(x=>x.id===v.meds[i].itemId);
    if(it3){const q3=stockQty(it3.id);
      if(q3<=0){v.meds[i].dispense=false;save();drawRx();
        toast(it3.name+' — not in stock ('+q3+' in clinic). "Give from clinic" unticked.','bad');return;}
      if((v.meds[i].qty||0)>q3){v.meds[i].qty=q3;save();drawRx();
        toast('Only '+q3+' '+(it3.unit||'pcs')+' in stock — quantity capped','warn');return;}}}
  save();}`,
  1
);

/* ---- 13. saveBill: never issue more dispensed stock than exists ---- */
rep(
  `  CART.lines.forEach(l=>{if(l.medItemId){const it=DB.stockItems.find(i=>i.id===l.medItemId);
    if(it)DB.stockMoves.push({id:uid(),date:CART.date,itemId:it.id,type:'out',qty:l.qty,rate:it.rate||0,
      ref:'Bill '+docs[0].no,note:'dispensed',auto:true,billId:docs[0].id});}});`,
  `  CART.lines.forEach(l=>{if(l.medItemId){const it=DB.stockItems.find(i=>i.id===l.medItemId);
    if(it){const have=stockQty(it.id),q=Math.min(l.qty,Math.max(0,have));
      if(q<l.qty)toast('Only '+Math.max(0,have)+' of '+it.name+' in stock — issued '+q+' to this bill','warn');
      if(q>0)DB.stockMoves.push({id:uid(),date:CART.date,itemId:it.id,type:'out',qty:q,rate:it.rate||0,
        ref:'Bill '+docs[0].no,note:'dispensed',auto:true,billId:docs[0].id});}}});`,
  1
);

/* ---- 16. all user-facing storage texts tell the truth (central PostgreSQL) ---- */
rep(
  "const APP_VERSION='4.1';",
  "const APP_VERSION='6.0';",
  1
);
rep(
  `'<div class="card pad"><h3>Backup — read this once</h3>'+`,
  `'<div class="card pad"><h3>Backup &amp; safety</h3>'+`,
  1
);
rep(
  `'<div class="alert w"><span>⚠</span><div>Right now everything lives inside <b>this browser on this computer</b>. Clear the browser data and it is gone. Until we host it properly on a server, take a backup every Friday and keep the file in Google Drive.</div></div>'+`,
  `'<div class="alert i"><span>●</span><div><b>Your data is saved automatically to the clinic\\'s central database</b> (PostgreSQL hosted on Railway) after every entry — every device that signs in sees the same books. This browser only keeps a temporary working copy, so clearing it is safe. Even so, download a backup every Friday and keep the file in Google Drive — belt and braces.</div></div>'+`,
  1
);
rep(
  `'<div class="hint" style="margin-top:8px">Data is written automatically after every entry. You are running <b>version '+APP_VERSION+'</b> — the sign-in screen shows this too, so you can always tell which file you opened.</div>'+`,
  `'<div class="hint" style="margin-top:8px">Everything is saved automatically to the central database after every entry — every signed-in device shares these books. You are running <b>version '+APP_VERSION+'</b>.</div>'+`,
  1
);
rep(
  `confirmBox('Erase everything?','Every patient, bill, expense and setting will be deleted from this browser. Take a backup first.',`,
  `confirmBox('Erase everything?','Every patient, bill, expense and setting will be deleted from the <b>central database</b> — for every device, not just this one. This cannot be recovered. Take a backup first.',`,
  1
);
rep(
  `$('#pinerr').textContent=userOk?'That password is wrong':'No such username on this device';`,
  `$('#pinerr').textContent=userOk?'That password is wrong':'No such username — ask the clinic admin';`,
  1
);
rep(
  "function recipeForm(sid){",
  `function delMove(id){
  if(!isOwner()){toast('Only the owner can remove entries','bad');return;}
  const m=DB.stockMoves.find(x=>x.id===id);if(!m)return;
  const it=DB.stockItems.find(i=>i.id===m.itemId)||{};
  confirmBox('Remove this stock entry?',
    '<b>'+esc(it.name||'Item')+'</b> · '+(m.type==='in'?'IN':'OUT')+' '+m.qty+' on '+dmy(m.date)+(m.ref?' — '+esc(m.ref):'')+
    '<br><br>Removing an <b>IN</b> entry reduces stock (a purchase taken back). Removing an <b>OUT</b> entry puts stock back. The removal is recorded in Staff Activity.'+
    (m.billId?'<br><br><b>Tip:</b> this entry was created by a bill — cancelling the bill (Bills &amp; Dues → ✕) is the cleaner way; bill and stock then stay in step.':''),
    ()=>{DB.stockMoves=DB.stockMoves.filter(x=>x.id!==id);
      logAct('delete','stock','Removed stock entry: '+(m.type==='in'?'IN':'OUT')+' '+m.qty+' × '+(it.name||'?')+(m.ref?' — '+m.ref:''),R((m.qty||0)*(m.rate||0)),m.id);
      save();refresh();toast('Stock entry removed','warn');},'Remove',true);
}
function delPay(billId,i){
  if(!isOwner()){toast('Only the owner can remove entries','bad');return;}
  const b=DB.bills.find(x=>x.id===billId);if(!b||!b.payments||!b.payments[i])return;
  const p=b.payments[i];
  confirmBox('Remove this payment?',
    esc(b.pname)+' · bill '+esc(b.no)+'<br>'+esc(p.mode)+' <b>'+money(p.amt)+'</b> on '+dmy(p.d)+
    '<br><br>The bill goes back to <b>due</b> by that amount. The removal is recorded in Staff Activity.',
    ()=>{b.payments.splice(i,1);
      logAct('delete','payment','Removed payment '+money(p.amt)+' ('+p.mode+') from '+b.no+' — '+b.pname,p.amt,b.id);
      save();closeModal();refresh();toast('Payment removed','warn');},'Remove',true);
}
function recipeForm(sid){`,
  1
);
rep(
  `    '<div class="alert i" style="margin-bottom:14px"><span>●</span><div><b>'+esc(b.pname)+'</b> · bill '+money(b.net)+' · already paid '+money(billPaid(b))+'<br><b>Balance '+money(due)+'</b></div></div>'+`,
  `    '<div class="alert i" style="margin-bottom:14px"><span>●</span><div><b>'+esc(b.pname)+'</b> · bill '+money(b.net)+' · already paid '+money(billPaid(b))+'<br><b>Balance '+money(due)+'</b></div></div>'+
    ((b.payments&&b.payments.length)?'<div class="f" style="margin-bottom:12px"><label>Payments already on this bill</label>'+
      b.payments.map((p,i)=>'<div class="tot"><span>'+esc(p.mode)+' · '+dmy(p.d)+(p.ref?' · <span style="font-size:11.5px;color:var(--ink3)">'+esc(p.ref)+'</span>':'')+'</span><span><b>'+money(p.amt)+'</b> '+(isOwner()?'<span style="cursor:pointer;color:var(--bad)" onclick="delPay(\\''+b.id+'\\','+i+')">✕</span>':'')+'</span></div>').join('')+'</div>':'')+`,
  1
);
rep(
  `   '<div class="tabs">'+[['stock','Stock &amp; movement'],['recipe','What each service consumes']]`,
  `   '<div class="tabs">'+[['stock','Stock &amp; movement'],['pl','Pharmacy &amp; stock P&amp;L'],['recipe','What each service consumes']]`,
  1
);
rep(
  `       m.qty,(m.auto?'<span class="chip info">auto</span> ':'')+esc(m.ref||m.note||'')];}),'No movement yet')+'</div></div>';
  }else{`,
  `       m.qty,(m.auto?'<span class="chip info">auto</span> ':'')+esc(m.ref||m.note||'')+(isOwner()?' <button class="btn sm ghost" onclick="delMove(\\''+m.id+'\\')">✕</button>':'')];}),'No movement yet')+'</div></div>';
  }else if(t==='pl'){
    const plp=VIEWS.stock.plp||'month';
    const fyr=fyRange(DB.settings.fy);
    const rng=plp==='month'?[today().slice(0,8)+'01',today()]:(plp==='fy'?[fyr[0],fyr[1]]:['2000-01-01',today()]);
    const inR=d=>d>=rng[0]&&d<=rng[1];
    const mv=DB.stockMoves.filter(m=>inR(m.date));
    const inQ={},inC={},soldQ={},soldC={},outQ={},outC={};
    mv.forEach(m=>{
      if(m.type==='in'){inQ[m.itemId]=(inQ[m.itemId]||0)+m.qty;inC[m.itemId]=(inC[m.itemId]||0)+m.qty*(m.rate||0);}
      else if(m.type==='out'){
        if(m.billId){soldQ[m.itemId]=(soldQ[m.itemId]||0)+m.qty;soldC[m.itemId]=(soldC[m.itemId]||0)+m.qty*(m.rate||0);}
        else{outQ[m.itemId]=(outQ[m.itemId]||0)+m.qty;outC[m.itemId]=(outC[m.itemId]||0)+m.qty*(m.rate||0);}}});
    const rev={};
    billsIn(rng[0],rng[1]).forEach(b=>{
      (b.lines||[]).forEach(l=>{
        if(l.medItemId){rev[l.medItemId]=(rev[l.medItemId]||0)+(l.amt||0);return;}
        const s=svcById(l.sid);
        if(s&&s.cat==='Goods & Appliances'){
          const rc=(s.consumes||[]).filter(c=>c.itemId);
          if(rc.length===1){rev[rc[0].itemId]=(rev[rc[0].itemId]||0)+(l.amt||0);}
          else if(rc.length>1){rc.forEach(c=>{rev[c.itemId]=(rev[c.itemId]||0)+(l.amt||0)/rc.length;});}
        }
      });
    });
    const rows=items.map(i=>{
      const sq=stockQty(i.id),r=R(rev[i.id]||0),c=R(soldC[i.id]||0);
      return {i:i,sq:sq,pq:inQ[i.id]||0,pc:R(inC[i.id]||0),s2:soldQ[i.id]||0,c:c,r:r,pl:R(r-c),oq:outQ[i.id]||0,oc:R(outC[i.id]||0)};});
    const tPc=R(sum(rows,r=>r.pc)),tSc=R(sum(rows,r=>r.c)),tR=R(sum(rows,r=>r.r)),tOc=R(sum(rows,r=>r.oc)),tPl=R(tR-tSc);
    const tPq=R(sum(rows,r=>r.pq)),tSq=R(sum(rows,r=>r.s2)),tOq=R(sum(rows,r=>r.oq));
    body='<div class="filterbar">'+
      [['month','This month'],['fy','This FY'],['all','All time']].map(x=>'<span class="pill'+(plp===x[0]?' on':'')+'" onclick="VIEWS.stock.plp=\\''+x[0]+'\\';refresh()">'+x[1]+'</span>').join('')+'</div>'+
     '<div class="grid g4" style="margin-bottom:14px">'+
      '<div class="kpi"><div class="l">Purchases (period)</div><div class="v">'+money0(tPc)+'</div><div class="d">'+tPq+' units purchased</div></div>'+
      '<div class="kpi"><div class="l">Sales — pharmacy &amp; goods</div><div class="v">'+money0(tR)+'</div><div class="d">charged on bills in period</div></div>'+
      '<div class="kpi"><div class="l">Cost of sales</div><div class="v">'+money0(tSc)+'</div><div class="d">'+tSq+' units issued to bills</div></div>'+
      '<div class="kpi acc"><div class="l">Stock P&amp;L</div><div class="v" style="color:'+(tPl>=0?'var(--ok)':'var(--bad)')+'">'+money0(tPl)+'</div><div class="d">sales − cost of sales</div></div>'+
     '</div>'+
     '<div class="grid g2" style="margin-bottom:14px">'+
      '<div class="kpi"><div class="l">Wastage / other issues</div><div class="v">'+money0(tOc)+'</div><div class="d">'+tOq+' units · never sold</div></div>'+
      '<div class="kpi"><div class="l">Closing stock value</div><div class="v">'+money0(val)+'</div><div class="d">at last purchase rate</div></div>'+
     '</div>'+
     '<div class="card pad"><h3>Item-wise — '+esc(rng[0])+' to '+esc(rng[1])+'</h3>'+
     '<div class="tw"><table><thead><tr><th>Item</th><th class="num">Purchased</th><th class="num">Cost ₹</th><th class="num">Sold / given</th><th class="num">Sales ₹</th><th class="num">Cost of sales ₹</th><th class="num">P&amp;L ₹</th><th class="num">Other out</th><th class="num">In stock</th></tr></thead><tbody>'+
     rows.map(r=>'<tr><td><b>'+esc(r.i.name)+'</b><div class="hint">'+esc(r.i.cat||'')+'</div></td>'+
       '<td class="num">'+r.pq+'</td><td class="num">'+money0(r.pc)+'</td>'+
       '<td class="num">'+r.s2+'</td><td class="num">'+money0(r.r)+'</td><td class="num">'+money0(r.c)+'</td>'+
       '<td class="num"><b style="color:'+((r.r||r.c)?(r.pl>=0?'var(--ok)':'var(--bad)'):'var(--ink3)')+'">'+((r.r||r.c)?money0(r.pl):'—')+'</b></td>'+
       '<td class="num">'+(r.oq?(r.oq+' <span class="chip warn">waste</span>'):'—')+'</td>'+
       '<td class="num"><b'+(r.sq<0?' style="color:var(--bad)"':'')+'>'+r.sq+'</b> '+esc(r.i.unit||'')+'</td></tr>').join('')+
     '<tr><td><b>Total</b></td><td class="num">'+tPq+'</td><td class="num"><b>'+money0(tPc)+'</b></td><td class="num">'+tSq+'</td>'+
       '<td class="num"><b>'+money0(tR)+'</b></td><td class="num"><b>'+money0(tSc)+'</b></td><td class="num"><b style="color:'+(tPl>=0?'var(--ok)':'var(--bad)')+'">'+money0(tPl)+'</b></td>'+
       '<td class="num">'+tOq+'</td><td></td></tr>'+
     '</tbody></table></div>'+
     '<div class="hint" style="margin-top:8px">Sales = dispensed medicines and rate-card goods charged on bills in the period. Consumables used inside procedures (PRP kits, plasters, syringes) show <b>cost only</b> — their income is part of the procedure price, so their P&amp;L column stays “—”. Dispensed medicines are billed at cost + 20% unless the front desk edits the rate.</div></div>';
  }else{`,
  1
);

/* ---- 17. in-app logins sync to NextAuth gate accounts ---- */
rep(
  "function pullCloud(){",
  `function syncGateUser(o){
  try{
    if(!o||!o.login||!o.user||!o.pass)return;
    fetch('/api/sync-user',{method:'POST',headers:{'content-type':'application/json'},keepalive:true,
      body:JSON.stringify({username:o.user,password:o.pass,name:o.name,role:o.role,active:o.active!==false})}).catch(function(){});
  }catch(e){}
}
function pullCloud(){`,
  1
);
rep(
  `    if(d)Object.assign(d,o);else{o.id=uid();DB.doctors.push(o);}
    logAct(d?'edit':'create','doctor',(d?'Updated ':'Added ')+(o.kind==='physio'?'physiotherapist ':'doctor ')+o.name,0,d?d.id:o.id);`,
  `    if(d)Object.assign(d,o);else{o.id=uid();DB.doctors.push(o);}
    syncGateUser({name:o.name,user:o.user,pass:o.pass,login:o.login,active:o.active,role:o.kind==='physio'?'PHYSIO':'DOCTOR'});
    logAct(d?'edit':'create','doctor',(d?'Updated ':'Added ')+(o.kind==='physio'?'physiotherapist ':'doctor ')+o.name,0,d?d.id:o.id);`,
  1
);
rep(
  `    if(s){Object.assign(s,o);logAct('edit','staff','Updated staff '+o.name,0,s.id);}
    else{o.id=uid();DB.staff.push(o);logAct('create','staff','Added staff '+o.name,0,o.id);}
    save();closeModal();refresh();`,
  `    if(s){Object.assign(s,o);logAct('edit','staff','Updated staff '+o.name,0,s.id);}
    else{o.id=uid();DB.staff.push(o);logAct('create','staff','Added staff '+o.name,0,o.id);}
    syncGateUser({name:o.name,user:o.user,pass:o.pass,login:o.login,active:o.active,role:'STAFF'});
    save();closeModal();refresh();`,
  1
);

/* ---- 18. Staff & Salary: show doctors & physiotherapists too ---- */
rep(
  `  '</div>'+
  (run?'<div class="card pad"><h3>Salary for '+mName(m)+'</h3>'+`,
  `   '</div>'+
  '<div class="card pad"><h3>Doctors &amp; physiotherapists</h3>'+
    '<div class="hint" style="margin-bottom:8px">Managed in <b>Doctors &amp; Physios</b> — listed here so the whole team is on one page. Their earnings appear in Reports for CA, and their procedures in the Admin Dashboard.</div>'+
    '<div class="tw"><table><thead><tr><th>Name</th><th>Role</th><th>Speciality</th><th>Can sign in</th><th>Status</th></tr></thead><tbody>'+
    DB.doctors.map(function(dc){return '<tr><td><b>'+esc(dc.name)+'</b><div class="hint">'+esc(dc.qual||'')+'</div></td>'+
      '<td>'+(dc.isOwner?'<span class="chip gold">Owner</span>':(dc.kind==='physio'?'Physiotherapist':'Doctor'))+'</td>'+
      '<td>'+esc(dc.spec||'')+'</td>'+
      '<td>'+(dc.login?'<span class="chip ok">'+esc(dc.user||'—')+'</span>':'<span class="chip">no login</span>')+'</td>'+
      '<td>'+(dc.active!==false?'<span class="chip ok">Active</span>':'<span class="chip">Inactive</span>')+'</td></tr>';}).join('')+
    '</tbody></table></div></div>'+
  (run?'<div class="card pad"><h3>Salary for '+mName(m)+'</h3>'+`,
  1
);

/* ---- 19. physio merge, salary & work type, payroll opt-out, days worked ---- */
/* 19a. docForm: salary + work type + payroll fields */
rep(
  `    '<div class="f"><label>Status</label><select id="dc_a"><option value="1"'+(!d||d.active!==false?' selected':'')+'>Active</option><option value="0"'+(d&&d.active===false?' selected':'')+'>Inactive</option></select></div>'+
    '</div>'+`,
  `    '<div class="f"><label>Status</label><select id="dc_a"><option value="1"'+(!d||d.active!==false?' selected':'')+'>Active</option><option value="0"'+(d&&d.active===false?' selected':'')+'>Inactive</option></select></div>'+
    '<div class="f"><label>Monthly salary ₹ (blank = not salaried)</label><input type="number" id="dc_sal" value="'+(d&&d.salary?d.salary:'')+'"></div>'+
    '<div class="f"><label>Work type</label><select id="dc_wt"><option value="Full-time"'+(d&&d.workType==='Full-time'?' selected':'')+'>Full-time</option><option value="Part-time"'+(d&&d.workType==='Part-time'?' selected':'')+'>Part-time</option><option value="Selected days"'+(d&&d.workType==='Selected days'?' selected':'')+'>Selected days</option></select></div>'+
    '<div class="f"><label><input type="checkbox" id="dc_pr" style="width:auto;margin-right:7px"'+(d&&d.payroll===false?'':' checked')+'> Include in salary payroll</label></div>'+
    '</div>'+`,
  1
);
rep(
  `    const o={name:$('#dc_n').value.trim(),qual:$('#dc_q').value.trim(),regNo:$('#dc_r').value.trim(),
      phone:$('#dc_p').value.trim(),spec:$('#dc_sp').value.trim(),active:$('#dc_a').value==='1',
      kind:$('#dc_k')?$('#dc_k').value:K,
      login:$('#dc_lg').value==='1',user:$('#dc_u').value.trim().toUpperCase(),pass:$('#dc_pw').value.trim(),perms:perms};`,
  `    const o={name:$('#dc_n').value.trim(),qual:$('#dc_q').value.trim(),regNo:$('#dc_r').value.trim(),
      phone:$('#dc_p').value.trim(),spec:$('#dc_sp').value.trim(),active:$('#dc_a').value==='1',
      salary:R($('#dc_sal').value),workType:$('#dc_wt').value,payroll:$('#dc_pr').checked,
      kind:$('#dc_k')?$('#dc_k').value:K,
      login:$('#dc_lg').value==='1',user:$('#dc_u').value.trim().toUpperCase(),pass:$('#dc_pw').value.trim(),perms:perms};`,
  1
);
/* 19b. staffForm: work type + payroll fields */
rep(
  `   '<div class="f"><label>Monthly salary ₹</label><input type="number" id="st_s" value="'+(s?s.salary:'')+'"></div>'+`,
  `   '<div class="f"><label>Monthly salary ₹</label><input type="number" id="st_s" value="'+(s?s.salary:'')+'"></div>'+
   '<div class="f"><label>Work type</label><select id="st_wt"><option value="Full-time"'+(s&&s.workType==='Full-time'?' selected':'')+'>Full-time</option><option value="Part-time"'+(s&&s.workType==='Part-time'?' selected':'')+'>Part-time</option><option value="Selected days"'+(s&&s.workType==='Selected days'?' selected':'')+'>Selected days</option></select></div>'+
   '<div class="f"><label><input type="checkbox" id="st_pr" style="width:auto;margin-right:7px"'+(s&&s.payroll===false?'':' checked')+'> Include in salary payroll</label></div>'+`,
  1
);
rep(
  `    const o={name:$('#st_n').value.trim(),role:$('#st_r').value.trim(),
      salary:R($('#st_s').value),phone:$('#st_p').value.trim(),joined:$('#st_j').value,
      active:$('#st_a').value==='1',bank:$('#st_b').value.trim(),`,
  `    const o={name:$('#st_n').value.trim(),role:$('#st_r').value.trim(),
      salary:R($('#st_s').value),workType:$('#st_wt').value,payroll:$('#st_pr').checked,phone:$('#st_p').value.trim(),joined:$('#st_j').value,
      active:$('#st_a').value==='1',bank:$('#st_b').value.trim(),`,
  1
);
/* 19c. staffForm: a physiotherapist is merged into Doctors & Physios */
rep(
  `    if(s){Object.assign(s,o);logAct('edit','staff','Updated staff '+o.name,0,s.id);}
    else{o.id=uid();DB.staff.push(o);logAct('create','staff','Added staff '+o.name,0,o.id);}
    syncGateUser({name:o.name,user:o.user,pass:o.pass,login:o.login,active:o.active,role:'STAFF'});
    save();closeModal();refresh();`,
  `    if(o.role==='Physiotherapist'){
      let doc=s?DB.doctors.find(x=>x.id===s.id):null;
      if(!doc&&o.user)doc=DB.doctors.find(x=>x.login&&x.user===o.user);
      const dd={name:o.name,phone:o.phone,active:o.active,salary:o.salary,workType:o.workType,payroll:o.payroll,
        kind:'physio',login:o.login,user:o.user,pass:o.pass,spec:'Physiotherapy',
        perms:Object.assign({},o.perms,{consult:true})};
      if(doc)Object.assign(doc,dd);else{dd.id=s?s.id:uid();DB.doctors.push(dd);}
      if(s)DB.staff=DB.staff.filter(x=>x.id!==s.id);
      syncGateUser({name:dd.name,user:dd.user,pass:dd.pass,login:dd.login,active:dd.active,role:'PHYSIO'});
      logAct(s?'edit':'create','doctor',(s?'Updated ':'Added ')+'physiotherapist '+o.name,0,doc?doc.id:dd.id);
      save();closeModal();refresh();toast('Saved in Doctors & Physios','ok');return;
    }
    if(s){Object.assign(s,o);logAct('edit','staff','Updated staff '+o.name,0,s.id);}
    else{o.id=uid();DB.staff.push(o);logAct('create','staff','Added staff '+o.name,0,o.id);}
    syncGateUser({name:o.name,user:o.user,pass:o.pass,login:o.login,active:o.active,role:'STAFF'});
    save();closeModal();refresh();`,
  1
);
/* 19d. staff table: show work type & payroll opt-out */
rep(
  `      return '<tr><td><b>'+esc(s.name)+'</b><div class="hint">'+esc(s.phone||'')+'</div></td><td>'+esc(s.role||'')+'</td>'+
      '<td class="num">'+money0(s.salary)+'</td>'+`,
  `      return '<tr><td><b>'+esc(s.name)+'</b><div class="hint">'+esc(s.phone||'')+'</div></td><td>'+esc(s.role||'')+(s.workType?'<div class="hint">'+esc(s.workType)+'</div>':'')+'</td>'+
      '<td class="num">'+money0(s.salary)+(s.payroll===false?' <span class="chip warn">not on payroll</span>':'')+'</td>'+`,
  1
);
/* 19e. payroll: doctors included, opt-out respected, days worked */
rep(
  "function genPayrun(m){",
  `function payPerson(id){return DB.staff.find(x=>x.id===id)||DB.doctors.find(x=>x.id===id)||{};}
function payDays(m,i,v){const run=DB.payruns.find(p=>p.month===m);run.rows[i].days=R(v);save();}
function genPayrun(m){`,
  1
);
rep(
  `  const rows=DB.staff.filter(s=>s.active!==false).map(s=>{
    const old=run&&run.rows.find(r=>r.staffId===s.id);`,
  `  const people=DB.staff.filter(s=>s.active!==false&&s.payroll!==false)
    .concat(DB.doctors.filter(dc=>dc.active!==false&&!dc.isOwner&&dc.payroll!==false&&(dc.salary||0)>0));
  const rows=people.map(s=>{
    const old=run&&run.rows.find(r=>r.staffId===s.id);`,
  1
);
rep(
  `,s=DB.staff.find(x=>x.id===r.staffId);`,
  `,s=payPerson(r.staffId);`,
  2
);
rep(
  `{if(r.paid)return;const s=DB.staff.find(x=>x.id===r.staffId);`,
  `{if(r.paid)return;const s=payPerson(r.staffId);`,
  1
);
rep(
  `run.rows.forEach(r=>{const s=DB.staff.find(x=>x.id===r.staffId)||{};`,
  `run.rows.forEach(r=>{const s=payPerson(r.staffId);`,
  1
);
rep(
  `    '<div class="tw"><table><thead><tr><th>Staff</th><th class="num">Salary</th><th class="num">Extra / bonus</th><th class="num">Advance</th><th class="num">Other deduction</th><th class="num">Prof. tax</th><th class="num">Net pay</th><th>Paid?</th><th></th></tr></thead><tbody>'+
    run.rows.map((r,i)=>{const s=DB.staff.find(x=>x.id===r.staffId)||{};
      return '<tr><td><b>'+esc(s.name||'?')+'</b><div class="hint">'+esc(s.role||'')+'</div></td>'+`,
  `    '<div class="tw"><table><thead><tr><th>Staff</th><th class="num">Days worked</th><th class="num">Salary</th><th class="num">Extra / bonus</th><th class="num">Advance</th><th class="num">Other deduction</th><th class="num">Prof. tax</th><th class="num">Net pay</th><th>Paid?</th><th></th></tr></thead><tbody>'+
    run.rows.map((r,i)=>{const s=payPerson(r.staffId);
      return '<tr><td><b>'+esc(s.name||'?')+'</b><div class="hint">'+esc(s.role||'')+(s.workType?' · '+esc(s.workType):'')+'</div></td>'+
      '<td class="num"><input type="number" min="0" max="31" value="'+(r.days!=null?r.days:'')+'" placeholder="—" style="width:60px;text-align:right;padding:4px 7px" onchange="payDays(\\''+m+'\\','+i+',this.value)"></td>'+`,
  1
);
rep(
  `    '<tr><td colspan="6" class="num"><b>TOTAL</b></td><td class="num"><b>'+money(sum(run.rows,r=>r.net))+'</b></td><td colspan="2"></td></tr>'+`,
  `    '<tr><td colspan="7" class="num"><b>TOTAL</b></td><td class="num"><b>'+money(sum(run.rows,r=>r.net))+'</b></td><td colspan="2"></td></tr>'+`,
  1
);

fs.writeFileSync(OUT, html);
console.log("clinic-app.html written:", html.length, "bytes");
