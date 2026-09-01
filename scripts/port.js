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

/* ---- 15. owner can delete any entry: stock movements + payments ---- */
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

fs.writeFileSync(OUT, html);
console.log("clinic-app.html written:", html.length, "bytes");
