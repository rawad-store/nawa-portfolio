// ===== Chart =====
function draw(x,plan){
  const cv=$('cv');if(!cv)return;
  const dpr=window.devicePixelRatio||1,W=900,H=380;
  cv.width=W*dpr;cv.height=H*dpr;
  cv.style.width='100%';cv.style.height='auto';
  const g=cv.getContext('2d');g.scale(dpr,dpr);g.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--chart-bg').trim()||'#0e1626';g.fillRect(0,0,W,H);
  const N=Math.min(110,x.b.length),bars=x.b.slice(-N),off=x.b.length-N;
  const all=bars.flatMap(b=>[b.h,b.l]);if(plan)all.push(plan.e,plan.s,...plan.t);
  let hi=Math.max(...all),lo=Math.min(...all);const pad=(hi-lo)*.06||1;hi+=pad;lo-=pad;
  const Y=p=>8+(hi-p)/(hi-lo)*(H-40),cw=(W-70)/N;
  g.font='11px system-ui';
  const line=(p,color,label)=>{if(p>hi||p<lo)return;g.strokeStyle=color;g.fillStyle=color;g.setLineDash([4,3]);g.beginPath();g.moveTo(0,Y(p));g.lineTo(W-68,Y(p));g.stroke();g.setLineDash([]);g.fillText(label+' '+fmt(p),W-66,Y(p)+3)};
  x.lv.sup.forEach(z=>line(z.p,'rgba(52,211,153,.5)','S'));
  x.lv.res.forEach(z=>line(z.p,'rgba(248,113,113,.5)','R'));
  const palette=getComputedStyle(document.documentElement),upColor=palette.getPropertyValue('--up').trim()||'#34d399',downColor=palette.getPropertyValue('--dn').trim()||'#f87171';
  bars.forEach((b,i)=>{const X=i*cw+cw/2,col=b.c>=b.o?upColor:downColor;
    g.strokeStyle=g.fillStyle=col;g.beginPath();g.moveTo(X,Y(b.h));g.lineTo(X,Y(b.l));g.stroke();
    g.fillRect(X-cw*.3,Y(Math.max(b.o,b.c)),cw*.6,Math.max(1,Math.abs(Y(b.o)-Y(b.c))))});
  [[x.E20,palette.getPropertyValue('--ac').trim()||'#60a5fa'],[x.E50,palette.getPropertyValue('--wn').trim()||'#fbbf24']].forEach(([arr,color])=>{
    g.strokeStyle=color;g.lineWidth=1.4;g.beginPath();
    bars.forEach((_,i)=>{const X=i*cw+cw/2,y=Y(arr[off+i]);i?g.lineTo(X,y):g.moveTo(X,y)});
    g.stroke();g.lineWidth=1});
  if(plan){line(plan.e,'#e8eef8','Entry');line(plan.s,'#f87171','Stop');plan.t.forEach((p,i)=>line(p,'#34d399','T'+(i+1)))}
}

function quoteLabel(live){
  if(!live)return 'آخر إغلاق تاريخي';
  if(live.source==='يدوي')return 'سعر يدوي';
  if(live.source==='ذاكرة محلية'||live.status==='غير متصل')return 'آخر سعر مخزن';
  if(live.source==='TradingView')return live.status==='متأخر'?'TradingView • متأخر':'TradingView';
  if(live.status==='متأخر')return `سعر متأخر • ${live.source||'المصدر'}`;
  if(live.status==='آخر إغلاق')return `آخر إغلاق • ${live.source||'المصدر'}`;
  if(live.status==='تاريخي')return `سعر تاريخي • ${live.source||'المصدر'}`;
  return live.source||'سعر من المصدر';
}
function quoteBadge(live){
  const label=quoteLabel(live),tone=!live||live.status==='متأخر'||live.status==='آخر إغلاق'||live.status==='تاريخي'||live.status==='غير متصل'?'nt':live.source==='يدوي'||live.source==='ذاكرة محلية'?'tag':'lb';
  const details=`المصدر: ${live?.source||'إغلاق الشمعة'}${live?.status?` • الحالة: ${live.status}`:''}${Number.isFinite(+live?.time)?` • الوقت: ${new Date(+live.time).toLocaleString('ar')}`:''}`;
  return `<span class="${tone} quote-chip" title="${esc(details)}">${esc(label)}</span>`;
}

// ===== Main actions =====
const busy=s=>['go','goPort'].forEach(id=>{const el=$(id);if(el)el.disabled=s});
if($('sy'))$('sy').addEventListener('keydown',e=>{if(e.key==='Enter')$('go').click()});

if($('go'))$('go').onclick=async()=>{
  const capVal=+$('ac').value,riskVal=+$('rk').value,costVal=+$('cs').value;
  if(!Number.isFinite(capVal)||capVal<0)return ms('رأس المال يجب أن يكون صفراً أو أكثر',true);
  if(!(riskVal>=0.1&&riskVal<=5))return ms('المخاطرة يجب أن تكون بين 0.1% و5%',true);
  if(!(costVal>=0&&costVal<=3))return ms('تكلفة الدخول والخروج يجب أن تكون بين 0% و3%',true);
  let asset;try{asset=detectAsset($('sy').value)}catch(e){return ms(e.message,true)}
  const tf=$('tf').value,custom=$('px').value.trim(),mpText=$('mp').value.trim(),mp=parseFloat(mpText);
  if(mpText&&!(mp>0))return ms('أدخل سعراً يدوياً أكبر من صفر أو اترك الحقل فارغاً',true);
  busy(true);$('ex').style.display='none';ms(mp>0?'⏳ جاري جلب الشموع التاريخية...':'⏳ جاري جلب البيانات والسعر اللحظي...');
  try{
    let{bars,live,higher}=await loadAll(asset,tf,custom,mp>0?mp:null);
    analyze(asset.label,asset.name,tf,bars,higher,asset.type,live);
  }catch(e){
    ms('تعذّر: '+e.message,true);$('out').style.display='block';$('out').innerHTML=`<div class="al">${esc(e.message)}</div>`;
  }finally{busy(false)}
};

if($('goPort'))$('goPort').onclick=async()=>{
  const costCheck=+$('cs').value;if(!(costCheck>=0&&costCheck<=3))return toast('تكلفة الدخول والخروج يجب أن تكون بين 0% و3%',true);
  if(!MY_PORTFOLIO.length)return toast('المحفظة فارغة',true);
  const tf=$('tf').value,custom=$('px').value.trim(),cost=Math.max(0,parseFloat($('cs').value)||0),total=MY_PORTFOLIO.length;
  busy(true);PORT_RES={};
  $('portfolioOut').innerHTML=`<div class="progress"><div id="pbar" style="width:0%"></div></div><p class="mu" id="pstatus">جاري التحليل... 0 / ${total}</p>`;
  const refNames={};
  try{
    const refList=JSON.parse(localStorage.getItem('u_hold_list_v3')||localStorage.getItem('u_hold_list_v2')||'[]');
    if(Array.isArray(refList))refList.forEach(r=>{if(Array.isArray(r)&&r[0]&&r[1])refNames[r[0]]=r[1]});
  }catch(e){}
  const results=[],queue=[...MY_PORTFOLIO];let done=0;
  let manualQuotes={};try{manualQuotes=JSON.parse(localStorage.getItem('u_hold_man_v1')||'{}')}catch(e){}
  const worker=async()=>{
    while(queue.length){
      const sym=queue.shift();
      try{
        const asset=detectAsset(sym);
        const displayName=refNames[sym]||asset.name;
        const manual=manualQuotes[sym];
        const {bars,live,higher}=await loadAll(asset,tf,custom,manual&&manual.price>0?manual.price:null);
        const bad=sanity(bars,live);if(bad)throw Error(bad);
        const x=study(bars,live?.price);let h=higher&&higher.length>=FULL_DECISION_BARS?study(higher):null;if(h&&!h.coverage.decisionReady)h=null;const d=decideWithCoverage(x,h,cost),nr=generateNotes(x,h,d);
        const rec={sym,x,h,d,nr,live,label:asset.label,name:displayName,type:asset.type};
        results.push(rec);PORT_RES[sym]=rec;
      }catch(e){results.push({sym,error:true,msg:e.message})}
      done++;
      const pb=$('pbar'),ps=$('pstatus');if(pb)pb.style.width=(done/total*100)+'%';if(ps)ps.textContent=`جاري التحليل... ${done} / ${total}`;
      await new Promise(r=>setTimeout(r,120));
    }};
  try{await Promise.all([worker(),worker(),worker()])}catch(e){}

  const valid=results.filter(r=>!r.error),buys=valid.filter(r=>r.d.v==='شراء'&&!r.d.limited),avoids=valid.filter(r=>r.d.v==='تجنّب'&&!r.d.limited),waits=valid.filter(r=>r.d.v==='انتظار'),limited=valid.filter(r=>r.d.limited);
  const failed=results.filter(r=>r.error);
  const pn=[];
  if(!valid.length)pn.push('لم تتوفر شموع تاريخية كافية لتحليل هذه الرموز. راجع رسائل كل سهم؛ قد يكون السعر الحالي متاحًا بينما مصدر الشموع لا يدعم رمزه.');
  else{
    if(limited.length)pn.push(`هناك ${limited.length} رموز ببيانات محدودة؛ عُرضت قراءة أولية فقط دون إشارة شراء أو تجنب حاسمة.`);
    if(buys.length>=3)pn.push(`هناك ${buys.length} أسهم تظهر إشارات شراء. ركّز على الأعلى توافقاً.`);
    if(avoids.length>valid.length*.45)pn.push('نسبة كبيرة من المحفظة في وضع تجنّب. يُفضل تقليل الانكشاف العام.');
    if(!buys.length)pn.push('لا توجد إشارات شراء قوية حالياً. الصبر أفضل من الدخول الضعيف.');
    if(waits.length>valid.length*.5)pn.push('معظم الأسهم في حالة انتظار. راقب الكسور والحجم.');
    pn.push('راجع كل سهم على حدة قبل اتخاذ أي قرار.');
  }
  const qualityRows=valid.filter(r=>(r.x.coverage?.rejectedInvalidOhlc||0)>0),rejectedBars=qualityRows.reduce((n,r)=>n+(r.x.coverage.rejectedInvalidOhlc||0),0);
  if(rejectedBars)pn.push(`جودة البيانات: استُبعدت ${rejectedBars} شموع OHLC غير متسقة من ${qualityRows.length} رموز؛ راجع تقرير كل سهم لمعرفة المصدر والتفاصيل.`);
  if(failed.length&&valid.length)pn.push(`تعذّر تحليل ${failed.length} من ${total} رموز بسبب عدم توفر بيانات تاريخية كافية. راجع سبب كل رمز أدناه؛ السعر الحي وحده لا يكفي لحساب المؤشرات الفنية.`);
  let html=`<div class="sg"><div class="sc"><div class="num up">${buys.length}</div><div class="mu">شراء</div></div><div class="sc"><div class="num nt">${waits.length}</div><div class="mu">انتظار</div></div><div class="sc"><div class="num dn">${avoids.length}</div><div class="mu">تجنّب</div></div></div>
  <div class="nb"><h3>ملاحظات وتوصيات عامة على المحفظة</h3><ul>${pn.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div>
  <div style="overflow-x:auto"><table class="ptable"><thead><tr><th>السهم</th><th>القرار</th><th>توافق الإشارات</th><th>السعر</th><th>RSI</th><th>التوصية المختصرة</th></tr></thead><tbody>`;
  const ord={'شراء':0,'انتظار':1,'تجنّب':2};
  results.sort((a,b)=>a.error?1:b.error?-1:(ord[a.d.v]??3)-(ord[b.d.v]??3)||b.d.conf-a.d.conf);
  for(const r of results){
    if(r.error){
      html+=`<tr><td><b class="ltr">${esc(r.sym)}</b></td><td colspan="4" class="dn">${esc(r.msg||'تعذّر الجلب')}</td><td><button class="sec sm wn" data-manual="${esc(r.sym)}" style="padding:3px 8px;font-size:.75rem">سعر يدوي</button></td></tr>`;
      continue;
    }
    const cls=r.d.v==='شراء'?'up':r.d.v==='تجنّب'?'dn':'nt';
    html+=`<tr data-sym="${esc(r.sym)}"><td><b class="ltr">${esc(r.sym)}</b><div class="mu" style="font-size:.7rem">${esc(r.name||'')}</div></td><td class="${cls}" style="font-weight:700">${r.d.v}${r.d.limited?' • محدود':''}</td><td>${r.d.conf}%</td><td class="ltr">${fmt(r.x.px)}${quoteBadge(r.x.live?r.live:null)}</td><td>${r.x.rsi.toFixed(1)}</td><td class="rec">${esc(shortRec(r.d,r.x))}</td></tr>`;
  }
  html+=`</tbody></table></div><p class="mu" style="margin-top:10px">شارة السعر تعرض المصدر والحالة، ومنها «متأخر» و«آخر سعر مخزن»؛ اضغط على أي صف لعرض التحليل التفصيلي.</p>`;
  if(failed.length)html+=`<button id="retryFailed" class="sec sm wn" style="margin-top:8px">🔄 إعادة المحاولة</button>`;
  $('portfolioOut').innerHTML=html;
  $('portfolioOut').querySelectorAll('tr[data-sym]').forEach(tr=>{tr.onclick=()=>{
    const r=PORT_RES[tr.dataset.sym];if(!r)return;
    last={label:r.label,name:r.name,tf,x:r.x,h:r.h,d:r.d,nr:r.nr,assetType:r.type,live:r.live};
    document.querySelector('.tab[data-tab="analyze"]').click();render(last);
    $('out').scrollIntoView({behavior:'smooth',block:'start'});
  }});
  $('portfolioOut').querySelectorAll('[data-manual]').forEach(b=>{b.onclick=(e)=>{
    e.stopPropagation();
    const sym=b.dataset.manual;
    const v=prompt(`أدخل سعر ${sym} من شاشة وسيطك:`);
    if(v===null)return;
    const p=parseFloat(v);
    if(!(p>0))return toast('سعر غير صالح',true);
    try{
      const man=JSON.parse(localStorage.getItem('u_hold_man_v1')||'{}');
      man[sym]={price:p,prev:null,time:Date.now()};
      localStorage.setItem('u_hold_man_v1',JSON.stringify(man));
      toast('✔ تم حفظ سعر '+sym+' — أعد التحليل');
      $('goPort').click();
    }catch(err){toast('تعذّر الحفظ',true)}
  }});
  if($('retryFailed'))$('retryFailed').onclick=()=>{
    Object.keys(_tvCache).forEach(k=>delete _tvCache[k]);
    $('goPort').click();
  };
  busy(false);toast('✔ تم تحليل المحفظة');
};

function sanity(bars,live){
  const lc=bars[bars.length-1].c;
  if(live&&live.price>0&&Math.abs(live.price/lc-1)>.25){
    if(live.source==='يدوي'||(live.source&&String(live.source).includes('TradingView')))return null;
    return`بيانات Yahoo التاريخية لهذا الرمز غير مطابقة للسعر الحالي (آخر إغلاق عندها ${fmt(lc)} مقابل ${fmt(live.price)} من ${live.source}). التحليل الفني على بيانات قديمة أو خاطئة يعطي مستويات مضللة، لذلك تم إيقافه.`;
  }
  return null;
}
function analyze(label,name,tf,bars,higherBars,assetType,live){
  const bad=sanity(bars,live);if(bad)throw Error(bad);
  const cost=Math.max(0,parseFloat($('cs').value)||0);
  const x=study(bars,live?.price);let h=higherBars&&higherBars.length>=FULL_DECISION_BARS?study(higherBars):null;if(h&&!h.coverage.decisionReady)h=null;
  const d=decideWithCoverage(x,h,cost),nr=generateNotes(x,h,d);
  last={label,name,tf,x,h,d,nr,assetType,live};
  render(last);save(label,name,tf,x,d,live);
  ms('✔ '+quoteLabel(x.live?live:null)+' • '+fmt(x.px));
}

function render(data){
  const{label,name,tf,x,d,nr,assetType,live}=data;
  const cls=d.v==='شراء'?'up':d.v==='تجنّب'?'dn':'nt',plan=d.plan;
  const cap=parseFloat($('ac').value),riskPct=parseFloat($('rk').value),cost=Math.max(0,parseFloat($('cs').value)||0);
  const badge={egx:'🇪🇬 EGX',crypto:'🪙 كريبتو',stock:'📊 سهم',fx:'💱 فوركس'}[assetType]||'';
  let size='';
  if(plan&&cap>0&&riskPct>0){
    const per=plan.rk+(plan.e+plan.s)*(cost/200);let u=Math.floor(cap*riskPct/100/per);
    if(u*plan.e>cap)u=Math.floor(cap/plan.e);
    size=u>=1?`<p>حجم مقترح: <b class="ltr">${u.toLocaleString('en-US')}</b> وحدة • قيمة ≈ <b class="ltr">${fmt(u*plan.e)}</b></p>`:`<p class="mu">رأس المال لا يكفي لوحدة واحدة بهذا المستوى من المخاطرة.</p>`;
  }
  const age=x.live&&live&&live.source!=='يدوي'&&live.source!=='ذاكرة محلية'?(Date.now()-live.time)/60000:0;
  const lastClose=x.b[x.b.length-1]?.c;
  const diverge=x.live&&lastClose>0&&Math.abs(x.px/lastClose-1)>.12;
  const stale=(live&&live.source==='ذاكرة محلية'?`<div class="al">◷ هذا آخر سعر محفوظ محليًا، وليس سعرًا حيًا. مصدره ${esc(live.originalSource||'مصدر سابق')} وآخر تحديث ${esc(new Date(live.time).toLocaleString('ar'))}. التحليل والإشارات المبنية عليه غير محدثة وليست توصية لحظية. تحقّق منه عند عودة الاتصال.</div>`:'')
    +(x.coverage&&!x.coverage.decisionReady?`<div class="al">⚠️ بيانات محدودة: ${x.coverage.bars} شمعة متاحة من ${FULL_DECISION_BARS} لازمة للإشارة الكاملة. تُعرض قراءة أولية فقط بلا توصية حاسمة.</div>`:'')
    +(x.coverage?.source&&x.coverage.source.includes('Valmore')?`<div class="al">المصدر التاريخي: ${esc(x.coverage.source)} (<a href="https://ir.valmore.com/en/share-and-corporate-information" target="_blank" rel="noopener noreferrer">الصفحة الرسمية</a>) • آخر شمعة ${esc(x.coverage.asOf||'—')}. هذا أرشيف مضمّن في نسخة التطبيق وقد يتقادم؛ عند تجاوز ${MAX_HISTORY_AGE_DAYS} أيام تُوقف الإشارة الحاسمة.</div>`:'')
    +(x.coverage?.stale?`<div class="al">⚠️ بيانات الشموع أقدم من ${MAX_HISTORY_AGE_DAYS} أيام، لذلك أُوقفت الإشارة الحاسمة. يمكن مراجعة المؤشرات بوصفها تاريخية فقط.</div>`:'')
    +(x.coverage?.rejectedInvalidOhlc?`<div class="al">تنبيه جودة المصدر: استُبعدت ${x.coverage.rejectedInvalidOhlc} شموع OHLC غير متسقة من ${x.coverage.rawRecordCount||'سجلات المصدر'}، وحُذفت ${x.coverage.duplicateRowsRemoved||0} صفوف مكررة. لم تُعدّل القيم ولم تُستبدل.</div>`:'')
    +(live&&live.status==='متأخر'?`<div class="al">سعر ${esc(live.source||'المصدر')} موسوم بأنه متأخر؛ لا يُعامل كسعر لحظي. تحقّق من وقت الرصد لدى المصدر.</div>`:'')
    +(diverge&&!(live&&live.aligned)?`<div class="al">ℹ️ السعر المستخدم (${fmt(x.px)} من ${esc(live?.source||'')}) يختلف عن آخر إغلاق في بيانات الشموع (${fmt(lastClose)}). المستويات تقريبية — اعتمد سعر وسيطك.</div>`:'')
    +(live&&live.aligned?`<div class="al" style="border-right-color:var(--up)">✔ تم محاذاة الشموع التاريخية مع سعر السوق الفعلي (${fmt(x.px)}) لتحسين دقة المستويات.</div>`:'');
  const box=(t,arr,c)=>arr.length?`<div class="nb ${c}"><h3>${t}</h3><ul>${arr.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div>`:'';
  $('out').style.display='block';$('ex').style.display='inline-block';$('clr').style.display='inline-block';
  $('out').innerHTML=`<h2 style="margin-top:0">${esc(name)} <span class="mu ltr">${esc(label)}</span> <span class="tag">${badge}</span> • ${esc(tf)}</h2>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0"><div class="vd ${cls}">${d.v}${d.limited?' • محدودة':''} <span class="mu" style="font-size:1rem">${d.limited?'قراءة أولية':'توافق الإشارات'} ${d.conf}%</span></div>${x.live?quoteBadge(live):''}</div>
  <div class="kv"><div>السعر المستخدم<b class="ltr" style="color:var(--ac)">${fmt(x.px)}</b></div><div>RSI(${x.coverage.periods.rsi})<b>${x.rsi.toFixed(1)}</b></div><div>ATR(${x.coverage.periods.atr}) %<b>${x.atrPct.toFixed(2)}%</b></div><div>الاتجاه<b>${x.dir}</b></div><div>الهيكل<b>${x.st}</b></div></div>
  ${stale}${d.reason?`<div class="al">${esc(d.reason)}</div>`:''}
  <canvas id="cv"></canvas><p class="mu">الأزرق EMA${x.e20Period} • الأصفر EMA${x.e50Period} • الخطوط المتقطعة: دعم / مقاومة</p>
  ${plan?`<h2>خطة التداول</h2><div class="kv"><div>الدخول<b class="ltr">${fmt(plan.e)}</b></div><div>الوقف<b class="dn ltr">${fmt(plan.s)}</b></div><div>هدف 1<b class="up ltr">${fmt(plan.t[0])}</b></div><div>هدف 2<b class="up ltr">${fmt(plan.t[1])}</b></div><div>المخاطرة %<b>${plan.rkp.toFixed(2)}%</b></div><div>R:R<b>${plan.rr||'—'}</b></div></div>${size}`:''}
  ${box('الملاحظات الفنية',nr.notes,'')}${box('المخاطر التي يجب مراعاتها',nr.risks,'warning')}${box('التوصيات',nr.recs,'success')}
  <p class="mu" style="margin-top:14px">البيانات التاريخية: ${x.b.length} شمعة • ${x.coverage?.source?`المصدر ${esc(x.coverage.source)} • آخر شمعة ${esc(x.coverage.asOf||'—')} • `:''}${x.live?'السعر من '+esc(live?.source||'المصدر')+' • الحالة '+esc(quoteLabel(live))+' • آخر تحديث '+esc(new Date(live.time).toLocaleString('ar')):'آخر إغلاق: '+esc(new Date(x.b[x.b.length-1].t).toLocaleDateString('ar'))}</p>`;
  draw(x,plan);
}

if($('ex'))$('ex').onclick=()=>{
  if(!last)return;
  const{name,label,tf,x,d,nr,live}=last;
  let t=`تقرير ${name} (${label}) • ${tf}\nالقرار: ${d.v}${d.limited?' — بيانات محدودة':''} • ${d.limited?'قراءة أولية':'توافق الإشارات'} ${d.conf}%\nالسعر المستخدم: ${fmt(x.px)} • ${quoteLabel(x.live?live:null)}\nالشموع: ${x.coverage?.bars||x.b.length} • المصدر: ${x.coverage?.source||'غير محدد'} • حتى: ${x.coverage?.asOf||'غير محدد'}\n\n`;
  [['الملاحظات',nr.notes],['المخاطر',nr.risks],['التوصيات',nr.recs]].forEach(([h,a])=>{if(a.length)t+=h+':\n'+a.map(n=>'• '+n).join('\n')+'\n\n'});
  t+='⚠️ تحليل تعليمي وليس نصيحة استثمارية';
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('تم نسخ التقرير')).catch(()=>toast('تعذر النسخ',true));
};

// ===== History =====
const HK='u_hist_v4';
const getHist=()=>{try{const a=JSON.parse(localStorage.getItem(HK)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}};
const setHist=a=>{try{localStorage.setItem(HK,JSON.stringify(a.slice(0,40)))}catch(e){}};
function save(label,name,tf,x,d,live){
  try{
    const a=getHist();
    a.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,6),ts:Date.now(),label,name,tf,v:d.v,limited:!!d.limited,bars:x.coverage?.bars||x.b.length,historyAsOf:x.coverage?.asOf||null,historySource:x.coverage?.source||null,conf:d.conf,px:x.px,rsi:+x.rsi.toFixed(1),dir:x.dir,live:x.live,stale:live&&live.source==='ذاكرة محلية',source:live?.source||'آخر إغلاق'});
    setHist(a);rh();
  }catch(e){}
}
function rh(){
  const a=getHist();if($('hc'))$('hc').textContent=a.length?`(${a.length})`:'';
  if(!$('hl'))return;
  if(!a.length){$('hl').innerHTML='<p class="mu">لا يوجد سجل بعد.</p>';return}
  $('hl').innerHTML=a.map(e=>{const cls=e.v==='شراء'?'up':e.v==='تجنّب'?'dn':'nt';
    return`<div class="hi"><div class="hm"><div><b>${esc(e.name)}</b> <b class="${cls}">${esc(e.v)}${e.limited?' • محدود':''}</b> <span class="mu">${e.limited?'قراءة أولية':'توافق الإشارات'} ${esc(e.conf)}% • ${e.bars||'—'} شمعة • <span class="ltr">${fmt(e.px)}</span>${e.stale?' • آخر سعر مخزن':e.live?' ●':''}</span></div><div class="hd">${esc(new Date(e.ts).toLocaleString('ar'))}</div></div><button class="sec sm dn" data-id="${esc(e.id)}">×</button></div>`}).join('');
  $('hl').querySelectorAll('[data-id]').forEach(b=>{b.onclick=()=>{setHist(getHist().filter(x=>x.id!==b.dataset.id));rh()}});
}
if($('xh'))$('xh').onclick=()=>{
  const a=getHist();if(!a.length)return toast('السجل فارغ',true);
  const url=URL.createObjectURL(new Blob([JSON.stringify(a,null,2)],{type:'application/json'}));
  const l=document.createElement('a');l.href=url;l.download='portfolio-history.json';document.body.appendChild(l);l.click();l.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);toast('تم التنزيل');
};
function clearScreen(){last=null;PORT_RES={};if($('out')){$('out').style.display='none';$('out').innerHTML=''}if($('portfolioOut'))$('portfolioOut').innerHTML='';if($('ex'))$('ex').style.display='none';if($('clr'))$('clr').style.display='none';ms('')}
if($('clr'))$('clr').onclick=()=>{clearScreen();toast('تم مسح الشاشة')};
if($('ch'))$('ch').onclick=()=>{
  if(!getHist().length&&!last&&!($('portfolioOut')&&$('portfolioOut').innerHTML))return toast('لا يوجد شيء للمسح');
  if(confirm('سيتم مسح السجل وآخر تحليل ونتائج المحفظة من الشاشة. متابعة؟')){
    setHist([]);Object.keys(localStorage).filter(k=>k.startsWith('u_y_')).forEach(k=>localStorage.removeItem(k));
    clearScreen();rh();toast('تم مسح كل شيء');
  }};
if($('clearCache'))$('clearCache').onclick=()=>{Object.keys(localStorage).filter(k=>k.startsWith('u_y_')).forEach(k=>localStorage.removeItem(k));localStorage.removeItem('u_market_quotes_v1');Object.keys(_tvCache).forEach(k=>delete _tvCache[k]);toast('تم مسح بيانات الأسعار والكاش المحلي')};
if($('exportAll'))$('exportAll').onclick=()=>{
  try{
    const data={
      schemaVersion:3,
      exportedAt:new Date().toISOString(),
      portfolio:MY_PORTFOLIO,
      holdings:JSON.parse(localStorage.getItem('u_hold_list_v3')||'[]'),
      manual:JSON.parse(localStorage.getItem('u_hold_man_v1')||'{}'),
      quotes:JSON.parse(localStorage.getItem('u_market_quotes_v1')||'{}'),
      history:getHist(),
      flows:JSON.parse(localStorage.getItem('u_hold_flow_v1')||'[]'),
      snaps:JSON.parse(localStorage.getItem('u_hold_snap_v1')||'[]'),
      log:JSON.parse(localStorage.getItem('u_hold_log_v1')||'[]'),
      lim:JSON.parse(localStorage.getItem('u_hold_lim_v1')||'null'),
      settings:{cap:localStorage.getItem('u_cap'),px:localStorage.getItem('u_px'),theme:localStorage.getItem('u_theme_v1')}
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='my-portfolio-full-backup.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);toast('تم تصدير النسخة الاحتياطية');
  }catch(e){toast('تعذّر التصدير',true)}
};
if($('importAll'))$('importAll').onclick=()=>$('importFile')?.click();
if($('importFile'))$('importFile').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!data||typeof data!=='object'||!Array.isArray(data.portfolio)||!data.portfolio.every(x=>typeof x==='string')||!Array.isArray(data.history))throw Error('صيغة النسخة الاحتياطية غير معروفة');
    if(['holdings','flows','snaps','log'].some(k=>data[k]!=null&&!Array.isArray(data[k])))throw Error('بعض بيانات النسخة غير صالحة');
    if(data.manual!=null&&(typeof data.manual!=='object'||Array.isArray(data.manual)))throw Error('بيانات الأسعار اليدوية غير صالحة');
    if(data.quotes!=null&&(typeof data.quotes!=='object'||Array.isArray(data.quotes)))throw Error('بيانات الأسعار المخزنة غير صالحة');
    if(data.settings!=null&&(typeof data.settings!=='object'||Array.isArray(data.settings)))throw Error('الإعدادات في النسخة غير صالحة');
    if(!confirm('سيتم تحديث البيانات الموجودة في ملف النسخة فقط؛ وأي بيانات غير واردة فيه ستبقى كما هي. نزّل نسخة حالية قبل المتابعة إذا لزم. متابعة؟'))return;
    const keys={portfolio:'u_portfolio_v4',history:'u_hist_v4',holdings:'u_hold_list_v3',flows:'u_hold_flow_v1',snaps:'u_hold_snap_v1',log:'u_hold_log_v1',manual:'u_hold_man_v1',lim:'u_hold_lim_v1',quotes:'u_market_quotes_v1'};
    const writes={};for(const [field,key] of Object.entries(keys))if(data[field]!=null)writes[key]=JSON.stringify(data[field]);
    if(data.settings&&Object.prototype.hasOwnProperty.call(data.settings,'cap'))writes.u_cap=data.settings.cap==null?null:String(data.settings.cap);
    if(data.settings&&Object.prototype.hasOwnProperty.call(data.settings,'px'))writes.u_px=data.settings.px==null?null:String(data.settings.px);
    if(data.settings&&Object.prototype.hasOwnProperty.call(data.settings,'theme'))writes.u_theme_v1=data.settings.theme==null?null:String(data.settings.theme);
    const previous=Object.fromEntries(Object.keys(writes).map(k=>[k,localStorage.getItem(k)]));
    try{for(const [key,value] of Object.entries(writes)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}}
    catch(storageError){for(const [key,value] of Object.entries(previous)){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch(_){}}throw storageError}
    toast('تمت استعادة البيانات');setTimeout(()=>location.reload(),450);
  }catch(err){toast('تعذّرت الاستعادة: '+(err.message||'ملف غير صالح'),true)}
  finally{e.target.value=''}
};

updatePortCount();rh();
updateNetworkState();
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
