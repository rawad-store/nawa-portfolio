/* محفظتي الفعلية — نسخة محسّنة مع متوسط التكلفة والربح/الخسارة غير المحققة */
(function(){
'use strict';

const REF0=[
  ['ABUK','شركة اختبار للأسمدة',12,'اختبار',18],
  ['VLMRA','شركة اختبار EGX',7,'اختبار',21]
];

const K={
  list:'u_hold_list_v3',
  man:'u_hold_man_v1',
  flow:'u_hold_flow_v1',
  snap:'u_hold_snap_v1',
  lim:'u_hold_lim_v1',
  log:'u_hold_log_v1',
  lastFetch:'u_hold_last_fetch_v1'
};
const ld=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}};
const sv=(k,v)=>{
  try{localStorage.setItem(k,JSON.stringify(v))}
  catch(e){
    try{Object.keys(localStorage).filter(x=>x.startsWith('u_y_')).forEach(x=>localStorage.removeItem(x));localStorage.setItem(k,JSON.stringify(v))}
    catch(e2){toast('تعذّر الحفظ المحلي — المساحة ممتلئة',true)}
  }
};

// Migrate from v2 if needed
let REF=ld(K.list,null);
if(!Array.isArray(REF)||!REF.length){
  const old=ld('u_hold_list_v2',[]);
  if(Array.isArray(old)&&old.length){
    REF=old.map(r=>{
      if(!Array.isArray(r)||!r[0])return null;
      // [sym, name, qty, sector] → add avgCost=0
      return [r[0],r[1]||r[0],+r[2]||0,r[3]||'غير محدد',+r[4]||0];
    }).filter(Boolean);
    sv(K.list,REF);
  }else REF=[];
}
REF=REF.filter(r=>Array.isArray(r)&&r.length>=3&&typeof r[0]==='string'&&r[0])
  .map(r=>[r[0],r[1]||r[0],Math.max(0,+r[2]||0),r[3]||'غير محدد',Math.max(0,+r[4]||0)]);

const saveList=()=>{sv(K.list,REF);syncPortfolioFromRef()};
const qtyOf=s=>{const r=REF.find(x=>x[0]===s);return r?r[2]:0};
const avgOf=s=>{const r=REF.find(x=>x[0]===s);return r?r[4]:0};

function syncPortfolioFromRef(){
  // Watchlist and owned positions are intentionally separate; never overwrite either data set.
  if(typeof updatePortCount==='function')updatePortCount();
  if(typeof renderPortList==='function')renderPortList();
}
window.__syncRefFromPortfolio=function(){ /* Deliberately decoupled to protect actual holdings. */ };
syncPortfolioFromRef();

let Q={},QR={},fetching=false,autoTried=false,lastFetchTs=ld(K.lastFetch,0);

const dayEG=t=>Math.floor((t+7200000)/86400000);
function getProxy(){
  const v=($('px')&&$('px').value||'').trim();
  return v||(typeof DEFAULT_PROXY!=='undefined'?DEFAULT_PROXY:'https://yahoo-proxy.tarek500500.workers.dev/');
}

async function quote(sym,custom){
  if(navigator.onLine===false)return getCachedMarketQuote(sym)||{err:'لا يوجد سعر محفوظ لهذا الرمز؛ اتصل بالإنترنت لجلبه.'};
  const q=await getEgxMarketQuote(sym,custom);
  if(q&&q.price>0)return q;
  return{err:'تعذّر جلب السعر من TradingView أو Yahoo؛ تحقق من وسيط الأسعار أو أعد المحاولة.'};
}

function calc(rows){
  const ok=rows.filter(r=>r.q&&!r.q.err&&r.q.price>0);
  let tot=0,prevTot=0,chg=0,invested=0,unrealized=0,withChg=0,pnlInvested=0,pnlCount=0,unknownCostCount=0,missingCostPriceCount=0,unknownCostValue=0;
  ok.forEach(r=>{
    r.val=r.qty*r.q.price;
    tot+=r.val;
  });
  rows.forEach(r=>{
    const qty=+r.qty||0,avg=+r.avgCost||0;
    if(!(qty>0)){r.cost=null;r.upl=null;r.uplPct=null;return}
    if(avg>0){r.cost=qty*avg;invested+=r.cost}
    else{r.cost=null;r.upl=null;r.uplPct=null;unknownCostCount++}
    if(!r.q||r.q.err||!(+r.q.price>0)){
      r.upl=null;r.uplPct=null;
      if(avg>0)missingCostPriceCount++;
      return;
    }
    r.val=qty*+r.q.price;
    if(avg>0){
      r.upl=r.val-r.cost;
      r.uplPct=r.cost>0?(r.upl/r.cost)*100:null;
      pnlInvested+=r.cost;unrealized+=r.upl;pnlCount++;
    }else unknownCostValue+=r.val;
  });
  ok.forEach(r=>{
    // التغير اليومي: أولوية للسعر السابق، ثم chgPct من TradingView
    if(r.q.prev>0){
      r.chg=r.qty*(r.q.price-r.q.prev);
      r.pct=(r.q.price/r.q.prev-1)*100;
      chg+=r.chg;prevTot+=r.qty*r.q.prev;withChg++;
    }else if(r.q.chgPct!=null&&Number.isFinite(+r.q.chgPct)&&+r.q.chgPct>-100){
      r.pct=r.q.chgPct;
      r.chg=r.val*(r.q.chgPct/100);
      chg+=r.chg;
      prevTot+=r.val/(1+r.q.chgPct/100);
      withChg++;
    }else{
      r.chg=null;r.pct=null;
    }
  });
  ok.forEach(r=>r.w=tot?r.val/tot*100:0);
  const withPct=ok.filter(r=>r.pct!=null);
  const sorted=[...withPct].sort((a,b)=>b.pct-a.pct);
  const sec={};ok.forEach(r=>{sec[r.sector]=(sec[r.sector]||0)+r.w});
  return{
    tot,prevTot,chg,pct:prevTot?chg/prevTot*100:null,
    invested,pnlInvested,unrealized:pnlCount?unrealized:null,unrealizedPct:pnlInvested>0?(unrealized/pnlInvested)*100:null,
    pnlCount,unknownCostCount,missingCostPriceCount,unknownCostValue,
    unrealizedComplete:rows.length>0&&unknownCostCount===0&&missingCostPriceCount===0&&ok.length===rows.length,
    missing:rows.length-ok.length,noPrev:ok.length-withChg,
    complete:ok.length===rows.length&&rows.length>0,
    chgComplete:withChg===rows.length&&rows.length>0,
    best:sorted[0],worst:sorted[sorted.length-1],
    top:[...ok].sort((a,b)=>b.w-a.w)[0],
    sec,ok
  };
}

function merge(){
  const man=ld(K.man,{});Q={};
  REF.forEach(r=>{
    const s=r[0],raw=QR[s],m=man[s];
    if(m&&(!raw||raw.err||m.time>=(raw.time||0)))Q[s]={price:m.price,prev:m.prev,time:m.time,status:'يدوي',source:'إدخال يدوي منك'};
    else if(raw)Q[s]=raw;
  });
}
window.__calcHoldings=calc;



const tabs=document.querySelector('.tabs'),host=document.querySelector('#tab-settings').parentNode;
const tb=document.createElement('button');tb.type='button';tb.id='nav-holdings';tb.setAttribute('aria-controls','tab-holdings');
tb.className='tab';tb.dataset.hold='1';tb.innerHTML='<span class="tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8.5h18v11H3zM7 8.5V5h10v3.5M3 13h18M10 12.8v1.6h4v-1.6"/></svg></span><span>محفظتي الفعلية</span>';
tabs.insertBefore(tb,tabs.children[1]);
const pn=document.createElement('div');pn.id='tab-holdings';pn.className='view-page';pn.setAttribute('role','tabpanel');pn.setAttribute('aria-labelledby','nav-holdings');pn.setAttribute('aria-hidden','true');pn.tabIndex=0;pn.style.display='none';host.appendChild(pn);
tabs.setAttribute('role','tablist');
const setTabA11y=()=>tabs.querySelectorAll('.tab').forEach(t=>{t.setAttribute('role','tab');t.setAttribute('aria-selected',t.classList.contains('active')?'true':'false');t.tabIndex=t.classList.contains('active')?0:-1});
setTabA11y();
tabs.addEventListener('click',e=>{if(e.target.closest('.tab'))setTabA11y()});
tabs.addEventListener('keydown',e=>{
  const items=[...tabs.querySelectorAll('.tab')],i=items.indexOf(e.target.closest('.tab'));if(i<0)return;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();items[i].click()}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const step=e.key==='ArrowLeft'?1:-1,n=items[(i+step+items.length)%items.length];n.focus();n.click()}
});

document.querySelectorAll('.tab[data-tab]').forEach(t=>t.addEventListener('click',()=>{
  pn.style.display='none';pn.setAttribute('aria-hidden','true');tb.classList.remove('active');
}));

tb.onclick=()=>{
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  tb.classList.add('active');
  ['analyze','portfolio','history','settings'].forEach(i=>{const el=$('tab-'+i);if(el){el.style.display='none';el.setAttribute('aria-hidden','true')}});
  pn.style.display='block';pn.setAttribute('aria-hidden','false');
  if(typeof setPageMeta==='function')setPageMeta('holdings');
  shell();
  paint();
  const age=Date.now()-(lastFetchTs||0);
  if(!fetching && (!lastFetchTs || age>180000 || !Object.keys(QR).length)){
    refresh({silent:!!Object.keys(QR).length});
  }
};

const tagCls=s=>s==='متأخر'||s==='آخر إغلاق'||s==='يدوي'?'nt':s==='غير متاح'||s==='تاريخي'||s==='غير متصل'?'dn':'';
const cl=v=>v>0?'up':v<0?'dn':'';
const sg=v=>(v>0?'+':'')+fmt(v);

function shell(){
  if(pn.dataset.ready)return;
  pn.dataset.ready='1';
  pn.innerHTML=`
<div class="hdr-row">
  <div>
    <h2 style="margin:0">🏦 محفظتي الفعلية</h2>
    <p class="mu" style="margin:4px 0 0">سجل ملكية مستقل • متوسط التكلفة + الربح/الخسارة غير المحققة</p>
  </div>
  <div class="hdr-actions">
    <span class="status-pill" id="hStatus">—</span>
    <button id="hRef" class="wn">⟳ تحديث</button>
  </div>
</div>
<div id="hProgress" class="progress-wrap" style="display:none">
  <div class="progress-label"><span id="hProgTxt">جاري الجلب...</span><span id="hProgPct">0%</span></div>
  <div class="progress"><div id="hBar" style="width:0%"></div></div>
</div>
<div id="hOut"></div>

<div class="section-card">
  <h3><span class="ico">⚖️</span> حد التركّز</h3>
  <div class="add-row" style="margin:0">
    <input id="hLim" type="number" min="5" max="100" step="1" style="max-width:120px">
    <span class="mu">% أقصى وزن مسموح لمركز واحد</span>
  </div>
</div>

<div class="section-card">
  <h3><span class="ico">💸</span> تدفقات نقدية <span class="mu" style="font-weight:400">(لا تُحسب ربحاً)</span></h3>
  <div class="add-row">
    <select id="fT" style="max-width:110px"><option value="إيداع">إيداع</option><option value="سحب">سحب</option><option value="توزيعات">توزيعات</option></select>
    <input id="fA" type="number" min="0" step="any" placeholder="المبلغ (ج.م)">
    <input id="fD" type="date">
    <button id="fAdd" class="sm">＋ تسجيل</button>
  </div>
  <div id="fL" style="margin-top:10px"></div>
</div>

<div class="section-card">
  <h3><span class="ico">🔄</span> شراء / بيع / تعديل الكمية + متوسط التكلفة</h3>
  <div class="add-row">
    <select id="qA" style="max-width:130px"><option value="buy">شراء (إضافة)</option><option value="sell">بيع (تقليل)</option><option value="set">تعيين الكمية</option></select>
    <input id="qS" list="egxl" placeholder="رمز السهم" dir="ltr" style="max-width:130px">
    <input id="qN" type="number" min="0" step="1" placeholder="عدد الأسهم">
    <input id="qP" type="number" min="0" step="any" placeholder="سعر الشراء (للمتوسط)">
    <input id="qM" placeholder="اسم الشركة (لسهم جديد)">
    <input id="qC" placeholder="القطاع (اختياري)">
    <button id="qB" class="sec sm wn">تنفيذ</button>
  </div>
  <p class="mu" style="margin:8px 0 0">عند الشراء أدخل سعره. إذا كانت تكلفة الكمية القائمة مجهولة، عيّن متوسطها يدويًا أولًا؛ لن يُدمج شراء جديد على أساس تكلفة صفرية. البيع حتى الصفر يحذف السهم. لا يُنفَّذ تداول فعلي.</p>
</div>

<div class="section-card">
  <h3><span class="ico">📌</span> تعيين متوسط التكلفة يدوياً</h3>
  <div class="add-row">
    <select id="avgS" style="max-width:140px"></select>
    <input id="avgP" type="number" min="0" step="any" placeholder="متوسط التكلفة (ج.م)">
    <button id="avgB" class="sec sm wn">حفظ المتوسط</button>
    <button id="avgC" class="sec sm dn">مسح المتوسط</button>
  </div>
  <p class="mu" style="margin:8px 0 0">لتعديل متوسط التكلفة لسهم موجود بدون تغيير الكمية. يُستخدم لحساب الربح/الخسارة غير المحققة.</p>
</div>

<div class="section-card">
  <h3><span class="ico">✍️</span> سعر يدوي</h3>
  <div class="add-row">
    <select id="mS" style="max-width:130px"></select>
    <input id="mP" type="number" min="0" step="any" placeholder="السعر">
    <input id="mV" type="number" min="0" step="any" placeholder="الإغلاق السابق (اختياري)">
    <button id="mB" class="sec sm wn">حفظ</button>
    <button id="mC" class="sec sm dn">مسح اليدوي</button>
  </div>
  <p class="mu" style="margin:8px 0 0">يُستخدم إذا فشل الجلب أو كان أحدث. يظهر بحالة «يدوي».</p>
</div>

<div class="section-card history-card">
  <h3><span class="ico">🗂️</span> السجلات</h3>
  <details class="history-disclosure" id="sessionDisclosure">
    <summary><span class="summary-title">سجل الجلسات</span><span class="summary-count" id="sessionCount">0 جلسة</span><span class="summary-chevron" aria-hidden="true">⌄</span></summary>
    <div class="disclosure-body"><canvas id="hCv" width="900" height="260" style="display:none;margin-bottom:10px"></canvas><div id="sL"></div></div>
  </details>
  <details class="history-disclosure" id="quantityDisclosure">
    <summary><span class="summary-title">تعديلات الكميات</span><span class="summary-count" id="quantityCount">0 تعديل</span><span class="summary-chevron" aria-hidden="true">⌄</span></summary>
    <div class="disclosure-body"><div id="qL"></div></div>
  </details>
</div>

<div class="section-card">
  <h3><span class="ico">📥</span> استيراد محفظة تجريبية</h3>
  <p class="mu" style="margin:0 0 10px">سيتم استبدال المحفظة الحالية بقائمة تجريبية للاختبار فقط. لا تُستخدم إن كانت لديك بيانات حقيقية.</p>
  <button id="loadDemo" class="sec sm wn">تحميل القائمة التجريبية</button>
</div>
`;

  const limEl=$('hLim');if(limEl){limEl.value=ld(K.lim,30);limEl.onchange=()=>{sv(K.lim,+limEl.value||30);paint()}}
  if($('hRef'))$('hRef').onclick=()=>refresh({silent:false});
  if($('loadDemo'))$('loadDemo').onclick=()=>{
    if(!confirm('سيتم استبدال المحفظة الحالية بقائمة تجريبية. متابعة؟'))return;
    if(REF.length&&!confirm('المحفظة الحالية تحتوي على '+REF.length+' سهم. استبدالها كاملة؟'))return;
    REF=REF0.map(r=>r.slice());
    saveList();
    QR={};Q={};
    paint();
    toast('تم تحميل القائمة التجريبية');
  };

  if($('mB'))$('mB').onclick=()=>{
    const sy=$('mS').value,p=+$('mP').value,v=+$('mV').value;
    if(!sy)return toast('اختر السهم',true);
    if(!(p>0))return toast('أدخل سعراً صحيحاً',true);
    if($('mV').value!==''&&!(v>0))return toast('الإغلاق السابق غير صحيح',true);
    const m=ld(K.man,{});
    m[sy]={price:p,prev:v>0?v:null,time:Date.now()};
    sv(K.man,m);merge();snapshot();
    $('mP').value='';$('mV').value='';
    paint();toast('تم حفظ السعر اليدوي لـ '+sy);
  };
  if($('mC'))$('mC').onclick=()=>{
    const sy=$('mS').value,m=ld(K.man,{});
    if(!m[sy])return toast('لا يوجد سعر يدوي',true);
    delete m[sy];sv(K.man,m);paint();toast('تم المسح');
  };

  // تعيين متوسط التكلفة يدوياً
  if($('avgB'))$('avgB').onclick=()=>{
    const sy=$('avgS').value,p=+$('avgP').value;
    if(!sy)return toast('اختر السهم',true);
    if(!(p>0))return toast('أدخل متوسط تكلفة صحيحاً',true);
    const ex=REF.find(r=>r[0]===sy);
    if(!ex)return toast('السهم غير موجود في محفظتك',true);
    const old=ex[4]||0;
    ex[4]=p;
    saveList();
    const l=ld(K.log,[]);
    l.unshift({ts:Date.now(),s:sy,from:old,to:p,act:'avg'});
    sv(K.log,l);
    $('avgP').value='';
    paint();
    toast('تم تعيين متوسط تكلفة '+sy+' = '+fmt(p));
  };
  if($('avgC'))$('avgC').onclick=()=>{
    const sy=$('avgS').value;
    if(!sy)return toast('اختر السهم',true);
    const ex=REF.find(r=>r[0]===sy);
    if(!ex)return toast('السهم غير موجود',true);
    if(!(ex[4]>0))return toast('لا يوجد متوسط تكلفة مسجّل',true);
    const old=ex[4];
    ex[4]=0;
    saveList();
    const l=ld(K.log,[]);
    l.unshift({ts:Date.now(),s:sy,from:old,to:0,act:'avg'});
    sv(K.log,l);
    paint();
    toast('تم مسح متوسط تكلفة '+sy);
  };

  const fdEl=$('fD');if(fdEl)fdEl.value=new Date().toISOString().slice(0,10);
  if($('fAdd'))$('fAdd').onclick=()=>{
    const a=+$('fA').value;if(!(a>0))return toast('أدخل مبلغاً صحيحاً',true);
    const f=ld(K.flow,[]);
    f.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,6),t:$('fT').value,a,d:$('fD').value});
    sv(K.flow,f);$('fA').value='';paint();toast('تم التسجيل');
  };

  if($('qB'))$('qB').onclick=()=>{
    const act=$('qA').value,raw=$('qS').value.trim(),n=Math.floor(+$('qN').value);
    const buyPrice=+$('qP').value;
    if(!raw)return toast('اكتب رمز السهم',true);
    const hit=(typeof EGX!=='undefined')&&EGX.find(e=>e[1]===raw);
    const sym=hit?hit[0]:raw.toUpperCase().replace(/\s+/g,'');
    if(!/^[A-Z0-9]{2,10}$/.test(sym))return toast('رمز غير صالح',true);
    if($('qN').value===''||!(n>=0)||(act!=='set'&&n<1))return toast('أدخل عدد أسهم صحيحاً',true);
    if(act==='buy'&&!(buyPrice>0))return toast('أدخل سعر الشراء لحساب متوسط التكلفة',true);

    const ex=REF.find(r=>r[0]===sym),old=ex?ex[2]:0,oldAvg=ex?ex[4]:0;
    if(act==='buy'&&old>0&&!(oldAvg>0))return toast('متوسط تكلفة الكمية الحالية لـ '+sym+' غير معروف. عيّنه يدويًا أولًا حتى لا يُحسب متوسط شراء مضلل.',true);
    if(!ex&&act==='sell')return toast('السهم غير موجود في محفظتك',true);
    const nw=act==='buy'?old+n:act==='sell'?old-n:n;
    if(nw<0)return toast(`لا يمكن بيع ${n} وأنت تملك ${old} فقط`,true);
    if(nw===old&&act!=='set')return toast('لا تغيير',true);
    if(!ex&&nw===0)return toast('لا شيء للإضافة',true);

    let newAvg=oldAvg;
    if(act==='buy'){
      // Weighted average cost
      const totalCost=old*oldAvg + n*buyPrice;
      newAvg=nw>0?totalCost/nw:0;
    }else if(act==='set'&&buyPrice>0){
      newAvg=buyPrice;
    }
    // On sell we keep the same avgCost (average cost method)

    const msg=`${ex?'':'إضافة سهم جديد '}${sym}: من ${old.toLocaleString('en-US')} إلى ${nw.toLocaleString('en-US')}${nw===0?' (سيُحذف)':''}${act==='buy'?`\nمتوسط التكلفة الجديد ≈ ${fmt(newAvg)}` :''}.\nاكتب «تأكيد» للمتابعة:`;
    const w=prompt(msg);
    if(w!=='تأكيد')return toast('تم الإلغاء');

    if(!ex)REF.push([sym,(hit&&hit[1])||$('qM').value.trim()||sym,nw,$('qC').value.trim()||'غير محدد',newAvg]);
    else if(nw===0){REF=REF.filter(r=>r[0]!==sym);delete QR[sym]}
    else{ex[2]=nw;ex[4]=newAvg}

    saveList();
    const l=ld(K.log,[]);
    l.unshift({ts:Date.now(),s:sym,from:old,to:nw,act,price:act==='buy'?buyPrice:null,avg:newAvg});
    sv(K.log,l);
    ['qN','qS','qM','qC','qP'].forEach(i=>{const el=$(i);if(el)el.value=''});
    paint();
    toast(!ex?'أُضيف '+sym+' — اضغط تحديث':'تم تحديث الكمية ومتوسط التكلفة');
  };
}

function setStatus(txt,cls){
  const el=$('hStatus');if(!el)return;
  el.textContent=txt;el.className='status-pill'+(cls?' '+cls:'');
}

async function refresh(opts={}){
  if(fetching)return;
  if(!pn.dataset.ready)return;
  fetching=true;
  const silent=!!opts.silent;
  const b=$('hRef');
  if(b){b.disabled=true;b.textContent='جاري...'}
  setStatus('جاري التحديث...','busy');
  const prog=$('hProgress'),bar=$('hBar'),pt=$('hProgTxt'),pp=$('hProgPct');
  if(prog)prog.style.display='block';
  if(bar)bar.style.width='0%';
  if(pp)pp.textContent='0%';
  const custom=getProxy();
  const total=REF.length;
  if(!total){
    if(prog)prog.style.display='none';
    if(b){b.disabled=false;b.textContent='⟳ تحديث'}
    setStatus('المحفظة فارغة','warn');
    fetching=false;
    paint();
    return;
  }
  let done=0;
  const updateProg=()=>{
    done++;
    const pct=Math.round(done/total*100);
    if(bar)bar.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(pt)pt.textContent=`جلب الأسعار... ${done} / ${total}`;
  };
  try{
    const queue=[...REF];
    const worker=async()=>{
      while(queue.length){
        const r=queue.shift();
        try{QR[r[0]]=await quote(r[0],custom);if(QR[r[0]]&&!QR[r[0]].err&&QR[r[0]].source!=='ذاكرة محلية')saveMarketQuote(r[0],QR[r[0]])}catch(e){QR[r[0]]={err:e.message||'تعذّر الجلب'}}
        updateProg();
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    merge();
    const cachedOnly=Object.values(Q).some(q=>q&&q.source==='ذاكرة محلية');
    if(!cachedOnly){lastFetchTs=Date.now();sv(K.lastFetch,lastFetchTs);snapshot()}
    if(!silent)toast(cachedOnly?'تم عرض آخر الأسعار المحفوظة؛ ليست أسعارًا مباشرة':'✔ تم تحديث الأسعار');
    const cacheTimes=Object.values(Q).filter(q=>q&&q.source==='ذاكرة محلية').map(q=>q.time||0);
    setStatus(cachedOnly?'أسعار محفوظة • '+new Date(cacheTimes.length?Math.max(...cacheTimes):Date.now()).toLocaleString('ar'):'محدّث • '+new Date(lastFetchTs).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}),cachedOnly?'warn':'live');
  }catch(e){
    setStatus('فشل التحديث','warn');
    if(!silent)toast('تعذّر التحديث: '+(e.message||''),true);
  }finally{
    fetching=false;
    if(b){b.disabled=false;b.textContent='⟳ تحديث'}
    if(prog)setTimeout(()=>{if(prog)prog.style.display='none'},600);
    paint();
  }
}

const rowsNow=()=>REF.map(r=>({sym:r[0],name:r[1],sector:r[3],qty:qtyOf(r[0]),avgCost:avgOf(r[0]),q:Q[r[0]]}));

function snapshot(){
  const rows=rowsNow();
  if(!rows.length)return;
  const c=calc(rows);
  if(!c.complete||rows.some(r=>r.q&&(r.q.status==='تاريخي'||r.q.status==='غير متصل'||r.q.source==='ذاكرة محلية')))return;
  const times=rows.map(r=>r.q&&r.q.time).filter(t=>Number.isFinite(t));
  if(!times.length)return;
  const d=new Date(Math.max(...times)+7200000).toISOString().slice(0,10);
  const s=ld(K.snap,[]).filter(x=>x.d!==d);
  s.push({
    d,saved:Date.now(),
      status:rows.map(r=>r.q.status).join(','),
      prices:Object.fromEntries(rows.map(r=>[r.sym,r.q.price])),
      qty:Object.fromEntries(rows.map(r=>[r.sym,r.qty])),
      vals:Object.fromEntries(c.ok.map(r=>[r.sym,r.val])),
      total:c.tot,chg:c.chgComplete?c.chg:null,pct:c.chgComplete?c.pct:null,
      invested:c.invested,pnlInvested:c.pnlInvested,unrealized:c.unrealized,unrealizedComplete:c.unrealizedComplete,unknownCostCount:c.unknownCostCount,missingCostPriceCount:c.missingCostPriceCount
  });
  s.sort((a,b)=>a.d<b.d?-1:1);
  sv(K.snap,s);
}

function paint(){
  if(!pn.dataset.ready)return;
  merge();
  // تحديث قوائم الأسهم في القوائم المنسدلة
  const fillSelect=(id)=>{
    const el=$(id);if(!el)return;
    const cur=el.value;
    el.innerHTML=REF.map(r=>`<option value="${esc(r[0])}">${esc(r[0])}${r[4]>0?' • متوسط '+fmt(r[4]):''}</option>`).join('');
    if(REF.some(r=>r[0]===cur))el.value=cur;
  };
  fillSelect('mS');
  fillSelect('avgS');

  const allRows=rowsNow();
  // الإجماليات فقط على الأسهم ذات كمية > 0
  const rows=allRows.filter(r=>r.qty>0);
  const zeroCount=allRows.length-rows.length;
  const fetched=Object.keys(Q).length>0,c=calc(rows),lim=+ld(K.lim,30);
  let h='';

  if(!REF.length){
    h+=`<div class="al">محفظتك فارغة. أضف أسهمًا من تبويب «المحفظة» أو من قسم «شراء / بيع» أدناه، أو حمّل القائمة التجريبية من الأسفل.</div>`;
  }else if(!rows.length&&zeroCount){
    h+=`<div class="al">كل الأسهم في القائمة كميتها صفر. أضف كميات أو احذفها من الأسفل.</div>`;
  }else if(!fetched){
    h+=`<div class="al">لم تُجلب الأسعار بعد. يتم التحديث تلقائياً عند فتح التبويب، أو اضغط «تحديث».</div>`;
  }else{
    // ملخص مصادر الأسعار
    const srcCount={tv:0,yahoo:0,manual:0,local:0,err:0};
    rows.forEach(r=>{
      if(!r.q||r.q.err){srcCount.err++;return}
      if(r.q.status==='يدوي')srcCount.manual++;
      else if(r.q.source==='ذاكرة محلية')srcCount.local++;
      else if(r.q.source&&String(r.q.source).includes('TradingView'))srcCount.tv++;
      else srcCount.yahoo++;
    });
    const srcParts=[];
    if(srcCount.tv)srcParts.push(`${srcCount.tv} من TradingView`);
    if(srcCount.yahoo)srcParts.push(`${srcCount.yahoo} من Yahoo`);
    if(srcCount.manual)srcParts.push(`${srcCount.manual} يدوي`);
    if(srcCount.local)srcParts.push(`${srcCount.local} محفوظ محليًا (قديم)`);
    if(srcCount.err)srcParts.push(`${srcCount.err} فشل`);
    if(srcParts.length)h+=`<div class="al" style="border-right-color:var(--ac)">📡 مصادر الأسعار: ${srcParts.join(' • ')}</div>`;

    if(!c.complete)h+=`<div class="al">⚠️ بيانات ${c.missing} من ${rows.length} أسهم ناقصة — الإجماليات <b>جزئية</b>.</div>`;
    if(c.unknownCostCount)h+=`<div class="al">⚠️ متوسط تكلفة الشراء غير معروف لـ ${c.unknownCostCount} مركز${c.unknownCostCount===1?'':'ات'}؛ استُبعدت هذه المراكز من الربح/الخسارة غير المحققة. عيّن متوسط التكلفة يدويًا قبل تسجيل شراء إضافي عليها.</div>`;
    if(c.missingCostPriceCount)h+=`<div class="al">ℹ️ لا تتوفر أسعار قابلة للاستخدام لـ ${c.missingCostPriceCount} مراكز ذات تكلفة معروفة؛ لا تدخل في ربح/الخسارة المحسوب.</div>`;
    if(c.complete&&!c.chgComplete)h+=`<div class="al">ℹ️ ${c.noPrev} سهم بلا إغلاق سابق — التغير اليومي على الباقي فقط.</div>`;
    const cachedRows=rows.filter(r=>r.q&&r.q.source==='ذاكرة محلية');
    if(cachedRows.length)h+=`<div class="al">◷ تُستخدم آخر أسعار محفوظة لـ ${cachedRows.map(r=>esc(r.sym)).join('، ')}؛ التغير اليومي هنا محسوب منذ وقت حفظ السعر، وليس بالضرورة تغير اليوم.</div>`;
    const mn=rows.filter(r=>r.q&&r.q.status==='يدوي');
    if(mn.length)h+=`<div class="al">✍️ أسعار يدوية: ${mn.map(r=>esc(r.sym)).join('، ')}. تأكد منها من وسيطك.</div>`;
    if(c.top&&c.top.w>lim)h+=`<div class="al">⚠️ تركّز: <b>${esc(c.top.sym)}</b> يمثل ${c.top.w.toFixed(1)}% (الحد ${lim}%).</div>`;
    const old=rows.filter(r=>r.q&&!r.q.err&&r.q.status!=='متأخر'&&r.q.status!=='يدوي');
    if(old.length)h+=`<div class="al">ℹ️ ${old.length} سعر من آخر إغلاق/أقدم — ليست أسعار حية.</div>`;

    h+=`<div class="kpi-grid">
      <div class="kpi"><div class="label">القيمة السوقية${c.complete?'':' (جزئية)'}</div><div class="val ltr">${fmt(c.tot)}</div><div class="sub">ج.م</div></div>
      <div class="kpi"><div class="label">التغير اليومي</div><div class="val ltr ${cl(c.chg)}">${sg(c.chg)}</div><div class="sub ${cl(c.pct)}">${c.pct==null?'—':sg(+c.pct.toFixed(2))+'%'}${c.chgComplete?'':' (جزئي)'}</div></div>
      <div class="kpi"><div class="label">رأس المال المستثمر المعروف${c.unknownCostCount||c.missingCostPriceCount?' (جزئي)':''}</div><div class="val ltr">${c.invested>0?fmt(c.invested):'—'}</div><div class="sub">${c.unknownCostCount?`لا يشمل ${c.unknownCostCount} متوسط تكلفة مجهول`:'متوسط التكلفة × الكمية'}</div></div>
      <div class="kpi"><div class="label">الربح/الخسارة غير المحققة${c.unrealizedComplete?'':' (جزئي)'}</div><div class="val ltr ${cl(c.unrealized)}">${c.unrealized!=null?sg(c.unrealized):'—'}</div><div class="sub ${cl(c.unrealizedPct)}">${c.unrealizedPct!=null?sg(+c.unrealizedPct.toFixed(2))+'% من المراكز المسعرة ذات التكلفة المعروفة':c.unknownCostCount?'لا توجد تكلفة معروفة كافية للحساب':'لا توجد أسعار كافية للحساب'}</div></div>
      <div class="kpi"><div class="label">عدد المراكز</div><div class="val">${rows.length}</div><div class="sub">سهم</div></div>
      <div class="kpi"><div class="label">الأفضل / الأسوأ اليوم</div><div class="val" style="font-size:1.05rem">${c.best?esc(c.best.sym):'—'} / ${c.worst?esc(c.worst.sym):'—'}</div><div class="sub">${c.best?sg(+c.best.pct.toFixed(2))+'%':''} ${c.worst?sg(+c.worst.pct.toFixed(2))+'%':''}</div></div>
    </div>`;
  }

  const zeroRows=allRows.filter(r=>!(r.qty>0));

  h+=`<table class="ptable hT"><thead><tr><th>السهم</th><th>الكمية</th><th>السعر</th><th>متوسط التكلفة</th><th>تغير %</th><th>القيمة</th><th>ربح/خسارة</th><th>الوزن</th><th>الحالة</th></tr></thead><tbody>`;
  const cell=(label,cls,val)=>`<td data-l="${label}"${cls?` class="${cls}"`:''}><span class="v">${val}</span></td>`;

  if(!rows.length&&!zeroRows.length){
    h+=`<tr><td colspan="9" class="mu">لا توجد أسهم</td></tr>`;
  }

  rows.forEach(r=>{
    const q=r.q;
    const head=`<td class="nm"><b class="ltr">${esc(r.sym)}</b><div class="mu">${esc(r.name)}</div></td>`;
    if(!q){h+=`<tr data-hs="${esc(r.sym)}">${head}${cell('الكمية','ltr',r.qty.toLocaleString('en-US'))}${cell('السعر','mu','لم تُجلب')}</tr>`;return}
    if(q.err){h+=`<tr data-hs="${esc(r.sym)}">${head}${cell('الكمية','ltr',r.qty.toLocaleString('en-US'))}${cell('السعر','dn',esc(q.err))}${cell('الحالة','dn','غير متاح')}</tr>`;return}
    const hasP=r.pct!=null;
    const wBar=r.w?`<div class="weight-bar"><div style="width:${Math.min(100,r.w)}%"></div></div>`:'';
    const avgStr=r.avgCost>0?fmt(r.avgCost):'—';
    const uplStr=r.upl!=null?`<span class="${cl(r.upl)}">${sg(r.upl)}</span>`:'—';
    let statusLabel=q.status;
    if(q.source==='ذاكرة محلية')statusLabel='مخزن • '+new Date(q.time).toLocaleDateString('ar');
    else if(q.source&&String(q.source).includes('TradingView'))statusLabel='TV • '+q.status;
    else if(q.source&&String(q.source).includes('Yahoo'))statusLabel='Yahoo • '+q.status;
    else if(q.status==='يدوي')statusLabel='يدوي';
    h+=`<tr data-hs="${esc(r.sym)}">${head}${cell('الكمية','ltr',r.qty.toLocaleString('en-US'))}${cell('السعر','ltr',fmt(q.price))}${cell('متوسط التكلفة','ltr',avgStr)}${cell('تغير %','ltr '+(hasP?cl(r.pct):''),hasP?sg(+r.pct.toFixed(2))+'%':'—')}${cell('القيمة','ltr',fmt(r.val))}${cell('ربح/خسارة','',uplStr)}${cell('الوزن','',r.w.toFixed(1)+'%'+wBar)}${cell('الحالة',tagCls(q.status),statusLabel)}</tr>`;
  });
  h+=`</tbody></table>`;

  if(zeroRows.length){
    h+=`<div class="al" style="margin-top:12px">⚠️ أسهم بكمية صفر (لا تُحسب في الإجماليات): <b>${zeroRows.map(r=>esc(r.sym)).join('، ')}</b>
    <br><button id="purgeZero" class="sec sm dn" style="margin-top:8px">حذف الأسهم ذات الكمية صفر</button></div>`;
  }

  if(fetched){
    h+=`<div class="nb"><h3>تفاصيل السوق وآخر تحديث</h3><ul>`+
      rows.filter(r=>r.q&&!r.q.err).map(r=>{
        const q=r.q;
        return`<li><span class="sym-chip ltr">${esc(r.sym)}</span> افتتاح ${q.open?fmt(q.open):'—'} • أعلى ${q.high?fmt(q.high):'—'} • أدنى ${q.low?fmt(q.low):'—'} • حجم ${q.vol?fmt(q.vol):'—'} • ${esc(new Date(q.time).toLocaleString('ar'))} • ${esc(q.source)}</li>`;
      }).join('')+`</ul></div>`;
    if(c.ok.length){
      h+=`<div class="nb"><h3>التوزيع القطاعي</h3><ul>`+
        Object.entries(c.sec).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<li>${esc(k)}: <b>${v.toFixed(1)}%</b></li>`).join('')+`</ul></div>`;
    }
  }
  h+=`<p class="mu">اضغط أي سهم لتحليله فنياً. الربح/الخسارة غير المحققة تقديرية وتعتمد على متوسط التكلفة المدخل؛ المراكز ذات التكلفة المجهولة مستبعدة ومعلّمة كجزئية. لا تشمل الرسوم أو الضرائب أو التوزيعات أو الأرباح المحققة من البيع.</p>`;
  $('hOut').innerHTML=h;
  $('hOut').querySelectorAll('tr[data-hs]').forEach(tr=>tr.onclick=()=>{ 
    $('sy').value=tr.dataset.hs;
    document.querySelector('.tab[data-tab="analyze"]').click();
    $('go').click();
  });
  if($('purgeZero'))$('purgeZero').onclick=()=>{
    if(!confirm('حذف كل الأسهم ذات الكمية صفر من المحفظة الفعلية؟'))return;
    const removed=REF.filter(r=>!(r[2]>0)).map(r=>r[0]);
    REF=REF.filter(r=>r[2]>0);
    removed.forEach(s=>delete QR[s]);
    saveList();
    paint();
    toast('تم حذف '+removed.length+' سهم');
  };

  const f=ld(K.flow,[]);
  $('fL').innerHTML=f.length?f.map(x=>`<div class="hi"><div class="hm"><b>${esc(x.t)}</b> <span class="ltr">${fmt(x.a)}</span> <span class="hd">${esc(x.d)}</span></div><button class="sec sm dn" data-f="${esc(x.id)}">×</button></div>`).join(''):'<p class="mu">لا توجد تدفقات.</p>';
  $('fL').querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{sv(K.flow,ld(K.flow,[]).filter(x=>String(x.id)!==b.dataset.f));paint()});

  const s=ld(K.snap,[]),lg=ld(K.log,[]);
  const sessionCount=$('sessionCount'),quantityCount=$('quantityCount');
  if(sessionCount)sessionCount.textContent=`${s.length} ${s.length===1?'جلسة':'جلسات'}`;
  if(quantityCount)quantityCount.textContent=`${lg.length} ${lg.length===1?'تعديل':'تعديلات'}`;
  $('sL').innerHTML=s.length?s.slice().reverse().map(x=>`<div class="hi"><div class="hm"><b class="ltr">${esc(x.d)}</b> • <span class="ltr">${fmt(x.total)}</span> • تغير <span class="ltr">${x.chg==null?'—':sg(x.chg)}</span>${x.unrealized!=null?` • غير محقق${x.unrealizedComplete===true?'':' (جزئي أو غير موثق)'} <span class="${cl(x.unrealized)}">${sg(x.unrealized)}</span>`:`${x.unknownCostCount||x.missingCostPriceCount?` • غير محقق غير متاح${x.unknownCostCount?` — ${x.unknownCostCount} تكلفة مجهولة`:''}`:''}`}</div></div>`).join(''):'<p class="mu">لا توجد جلسات محفوظة. تُسجَّل عند كل تحديث مكتمل.</p>';
  $('qL').innerHTML=lg.length?lg.map(x=>`<div class="hi"><div class="hm">${esc(({buy:'شراء',sell:'بيع',set:'تعيين كمية',avg:'تعيين متوسط'})[x.act]||'تعديل')} ${esc(x.s)}: ${x.from} ← ${x.to}${x.price?` @ ${fmt(x.price)}`:''} <span class="hd">${esc(new Date(x.ts).toLocaleString('ar'))}</span></div></div>`).join(''):'<p class="mu">لا توجد تعديلات محفوظة.</p>';

  const cv=$('hCv');
  if(s.length>=2){
    cv.style.display='block';
    const dpr=window.devicePixelRatio||1,W=900,H=260;
    cv.width=W*dpr;cv.height=H*dpr;cv.style.width='100%';cv.style.height='auto';
    const g=cv.getContext('2d');g.scale(dpr,dpr);
    const v=s.map(x=>x.total),lo=Math.min(...v),hi=Math.max(...v),p=(hi-lo)||1;
    g.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--chart-bg').trim()||'#0e1626';g.fillRect(0,0,W,H);
    g.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--ac').trim()||'#60a5fa';g.lineWidth=2;g.beginPath();
    v.forEach((y,i)=>{const X=20+i*(W-40)/Math.max(1,v.length-1),Y=H-20-(y-lo)/p*(H-40);i?g.lineTo(X,Y):g.moveTo(X,Y)});
    g.stroke();
  }else if(cv)cv.style.display='none';

  if(!fetching&&rows.some(r=>r.q&&r.q.source==='ذاكرة محلية')){
    const times=rows.filter(r=>r.q&&r.q.source==='ذاكرة محلية').map(r=>r.q.time||0);
    setStatus('أسعار محفوظة • '+new Date(Math.max(...times)).toLocaleString('ar'),'warn');
  }else if(!fetching && lastFetchTs){
    const mins=Math.round((Date.now()-lastFetchTs)/60000);
    setStatus(mins<=1?'محدّث الآن':`محدّث منذ ${mins} د`,'live');
  }else if(!fetching && !lastFetchTs){
    setStatus('بانتظار التحديث','warn');
  }
}

function autoOnLoad(){
  if(autoTried)return;
  autoTried=true;
  setTimeout(()=>{
    if(fetching)return;
    if(!pn.dataset.ready)return;
    const age=Date.now()-(lastFetchTs||0);
    if(!lastFetchTs || age>120000)refresh({silent:true}).catch(()=>{});
  },900);
}
if(document.readyState==='complete')autoOnLoad();
else addEventListener('load',autoOnLoad);

})();
