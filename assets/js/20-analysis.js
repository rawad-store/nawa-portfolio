// ===== Indicators =====
const MIN_EXPLORATORY_BARS=5, FULL_DECISION_BARS=60, MAX_HISTORY_AGE_DAYS=10;
const ema=(arr,n)=>{const k=2/(n+1);let e=arr[0];return arr.map((x,i)=>i?(e=x*k+e*(1-k)):e)};
function rsi(c,n=14){
  const out=Array(c.length).fill(null);let g=0,l=0;
  for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}
  g/=n;l/=n;out[n]=g===0&&l===0?50:l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;out[i]=g===0&&l===0?50:l===0?100:100-100/(1+g/l)}
  return out;
}
function atr(bars,n=14){
  const tr=bars.map((b,i)=>i?Math.max(b.h-b.l,Math.abs(b.h-bars[i-1].c),Math.abs(b.l-bars[i-1].c)):b.h-b.l);
  let a=tr.slice(0,n).reduce((s,x)=>s+x,0)/n;const out=Array(bars.length).fill(null);out[n-1]=a;
  for(let i=n;i<bars.length;i++){a=(a*(n-1)+tr[i])/n;out[i]=a}
  return out;
}
function swings(bars,k=4){
  const H=[],L=[];
  for(let i=k;i<bars.length-k;i++){let isH=true,isL=true;
    for(let j=i-k;j<=i+k;j++){if(bars[j].h>bars[i].h)isH=false;if(bars[j].l<bars[i].l)isL=false}
    if(isH)H.push({i,p:bars[i].h});if(isL)L.push({i,p:bars[i].l})}
  return{H,L};
}
function levels(sw,a,px){
  const cl=[];
  [...sw.H,...sw.L].forEach(x=>{const f=cl.find(c=>Math.abs(c.p-x.p)<=a*.55);
    if(f){f.p=(f.p*f.n+x.p)/(f.n+1);f.n++}else cl.push({p:x.p,n:1})});
  const sc=z=>Math.abs(z.p-px)-z.n*a*.35;
  return{sup:cl.filter(z=>z.p<px).sort((p,q)=>sc(p)-sc(q)).slice(0,3).sort((p,q)=>q.p-p.p),
    res:cl.filter(z=>z.p>px).sort((p,q)=>sc(p)-sc(q)).slice(0,3).sort((p,q)=>p.p-q.p)};
}
function study(bars,livePrice=null){
  if(!bars||bars.length<MIN_EXPLORATORY_BARS)throw Error(`المتاح ${bars?.length||0} شموع فقط؛ يلزم ${MIN_EXPLORATORY_BARS} شموع على الأقل لقراءة أولية، ولن تُنشأ شموع افتراضية.`);
  const cl=bars.map(b=>b.c),n=cl.length-1,count=cl.length;
  const fullPeriods=count>=FULL_DECISION_BARS;
  const e20Period=fullPeriods?20:Math.min(20,Math.max(3,Math.floor(count*.35)));
  const e50Period=fullPeriods?50:Math.min(50,Math.max(e20Period+1,Math.floor(count*.70)));
  const e20=ema(cl,e20Period),e50=ema(cl,e50Period),e200=count>=210?ema(cl,200):null;
  const macdSlow=fullPeriods?26:Math.min(26,Math.max(4,Math.floor(count*.50)));
  const macdFast=fullPeriods?12:Math.min(12,Math.max(2,Math.floor(macdSlow*.5)));
  const macdSignal=fullPeriods?9:Math.min(9,Math.max(2,Math.floor(count*.2)));
  const e12=ema(cl,macdFast),e26=ema(cl,macdSlow),macd=e12.map((x,i)=>x-e26[i]),sig=ema(macd,macdSignal),hist=macd.map((x,i)=>x-sig[i]);
  const rsiPeriod=Math.min(14,count-1),atrPeriod=Math.min(14,count),ra=rsi(cl,rsiPeriod),aa=atr(bars,atrPeriod);
  const swingK=count>=25?4:Math.max(1,Math.floor(count/6)),sw=swings(bars,swingK);
  const px=livePrice>0?livePrice:cl[n],a=aa[n]||px*.02,lv=levels(sw,a,px);
  const slopeLookback=Math.min(10,Math.max(1,Math.floor(count*.2)));
  let s=0;s+=px>e50[n]?1.2:-1.2;s+=e20[n]>e50[n]?1:-1;
  if(e200)s+=px>e200[n]?1.1:-1.1;
  if(n>=slopeLookback)s+=e50[n]>e50[n-slopeLookback]?.8:-.8;
  const lH=sw.H.slice(-2),lL=sw.L.slice(-2);let st='غير محدد';
  if(lH.length===2&&lL.length===2){const hh=lH[1].p>lH[0].p,hl=lL[1].p>lL[0].p;
    if(hh&&hl){s+=2.2;st='قمم وقيعان أعلى'}else if(!hh&&!hl){s-=2.2;st='قمم وقيعان أدنى'}else st='هيكل متذبذب'}
  const dir=s>=2.2?'صاعد':s<=-2.2?'هابط':'عرضي';
  const vb=livePrice>0?bars.slice(0,-1):bars;
  const recentLen=Math.min(3,Math.max(1,Math.floor(vb.length*.2))),baseLen=Math.min(20,Math.max(2,vb.length-recentLen));
  const seg=vb.slice(-(recentLen+baseLen),-recentLen),recentVol=vb.slice(-recentLen);
  const volBase=seg.length?seg.reduce((t,b)=>t+(+b.v||0),0)/seg.length:0,volRecent=recentVol.length?recentVol.reduce((t,b)=>t+(+b.v||0),0)/recentVol.length:0;
  const histMeta=bars._historyMeta||{},asOf=histMeta.asOf||dayStamp(bars[bars.length-1]?.t),ageDays=asOf?Math.max(0,(Date.now()-Date.parse(asOf+'T23:59:59Z'))/86400000):Infinity;
  const old=ageDays>MAX_HISTORY_AGE_DAYS,decisionReady=count>=FULL_DECISION_BARS&&!old;
  const coverage={bars:count,required:FULL_DECISION_BARS,decisionReady,limited:!decisionReady,stale:old,ageDays,asOf,source:histMeta.source||'غير معروف',periods:{emaFast:e20Period,emaSlow:e50Period,macdFast,macdSlow,macdSignal,rsi:rsiPeriod,atr:atrPeriod,swing:swingK},rawRecordCount:histMeta.rawRecordCount,rejectedInvalidOhlc:histMeta.rejectedInvalidOhlc||0,duplicateRowsRemoved:histMeta.duplicateRowsRemoved||0};
  return{b:bars,px,a,e20:e20[n],e50:e50[n],e200:e200?e200[n]:null,E20:e20,E50:e50,e20Period,e50Period,rsi:ra[n],mh:hist[n],mhp:hist[n-1],s,dir,st,lv,vr:volBase>0?volRecent/volBase:null,atrPct:a/px*100,live:livePrice>0,coverage};
}

// ===== Decision + notes =====
function decide(x,h,cost){
  let t=x.s;
  t+=x.mh>0&&x.mh>x.mhp?1.1:x.mh<0&&x.mh<x.mhp?-1.1:0;
  if(x.rsi>52&&x.rsi<=68)t+=1.1;
  else if(x.rsi>68&&x.rsi<=75)t+=0.3;
  else if(x.rsi>75)t-=1.4;
  else if(x.rsi<48&&x.rsi>=32)t-=1;
  else if(x.rsi<32&&x.rsi>=22)t+=0.5;
  else if(x.rsi<22)t+=0.9;
  if(x.vr>1.4)t+=Math.sign(x.s||1)*0.85;
  else if(x.vr<0.65)t-=0.4;
  if(h){if(h.dir==='صاعد')t+=2.3;else if(h.dir==='هابط')t-=2.3;else t-=0.3}
  if(x.e20&&x.e50&&x.px>x.e20&&x.e20>x.e50)t+=0.6;
  if(x.e200&&x.px>x.e200)t+=0.4;else if(x.e200&&x.px<x.e200)t-=0.5;

  let v='انتظار',reason='',exitLvl=null,plan=null;
  if(t<=-5.8){v='تجنّب';reason='اتجاه هابط قوي';exitLvl=x.lv.sup[0]?x.lv.sup[0].p-.3*x.a:x.px-2*x.a}
  else if(t<5.2)reason=`قوة الإشارات (${t.toFixed(1)}) غير كافية للدخول`;
  else if(h&&h.dir==='هابط')reason='الإطار الأكبر هابط — الشراء ضد الاتجاه';
  else if(x.atrPct<0.30)reason='التذبذب ضعيف جداً — انتظار كسر أوضح';
  else if(x.rsi>76)reason='تشبع شرائي مرتفع — انتظار تهدئة';
  if(!reason){
    const e=x.px;
    let stop=x.lv.sup[0]?x.lv.sup[0].p-0.30*x.a:e-2*x.a;
    let risk=e-stop;
    if(risk<x.a*0.95){stop=e-1.15*x.a;risk=e-stop}
    if(risk>3.0*x.a){stop=e-2.5*x.a;risk=e-stop}
    stop=Math.max(stop,e*0.01);risk=e-stop;
    const t1=e+1.7*risk,t2=e+2.8*risk;
    const rr=x.lv.res[0]?(x.lv.res[0].p-e)/risk:null;
    if(rr!==null&&rr<1.35)reason='نسبة العائد/المخاطرة ضعيفة (مقاومة قريبة)';
    else if((t1-e)/e*100<cost*3.0)reason='الهدف لا يغطي تكاليف الصفقة';
    else{
      plan={e,s:stop,t:[t1,t2],rk:risk,rkp:risk/e*100,rr:rr!=null?+rr.toFixed(2):null};
      v='شراء';
    }
  }
  let conf=Math.min(88,30+Math.abs(t)*3.6);
  if(h&&((t>0&&h.dir==='صاعد')||(t<0&&h.dir==='هابط')))conf+=7;
  if(x.vr>1.5&&t>0)conf+=3;
  if(!plan)conf=Math.min(conf,46);
  return{v,reason,plan,conf:Math.round(Math.max(20,Math.min(90,conf))),t,exitLvl};
}
function decideWithCoverage(x,h,cost){
  const d=decide(x,h,cost);
  if(x.coverage?.decisionReady)return d;
  let reason=`بيانات محدودة: المتاح ${x.coverage?.bars||0} من ${FULL_DECISION_BARS} شمعة لازمة للإشارة الكاملة.`;
  if(x.coverage?.stale)reason=`الشموع التاريخية قديمة (آخر شمعة ${x.coverage.asOf||'غير معروف'}). المؤشرات للقراءة فقط حتى يتجدد التاريخ.`;
  return{...d,v:'انتظار',reason,plan:null,exitLvl:null,conf:Math.min(35,d.conf),limited:true};
}

function generateNotes(x,h,d){
  if(x.coverage&&!x.coverage.decisionReady){
    const p=x.coverage.periods;
    const notes=[`قراءة أولية من ${x.coverage.bars} شمعة. خُفّضت مدد بعض المؤشرات لتناسب السجل المتاح: EMA${p.emaFast}/EMA${p.emaSlow}، RSI(${p.rsi})، MACD(${p.macdFast},${p.macdSlow},${p.macdSignal}). هذه ليست الإعدادات القياسية كاملة.`];
    if(x.coverage.stale)notes.push(`آخر شمعة بتاريخ ${x.coverage.asOf}؛ البيانات أقدم من ${MAX_HISTORY_AGE_DAYS} أيام.`);
    if(x.coverage.rejectedInvalidOhlc)notes.push(`استُبعدت ${x.coverage.rejectedInvalidOhlc} سجلات OHLC غير متسقة من النسخة المصدرية؛ لم تُعدّل قيمها.`);
    if(x.coverage.source)notes.push(`مصدر التاريخ: ${x.coverage.source}.`);
    return{notes,risks:['الشموع المتاحة غير كافية أو قديمة لإصدار إشارة شراء/تجنب أو خطة دخول ووقف موثوقة.'],recs:['لا تعتمد هذه القراءة لاتخاذ قرار حاسم. أعد التحليل بعد توفر 60 شمعة حديثة على الأقل.']};
  }
  const notes=[],risks=[],recs=[];
  if(x.dir==='صاعد'&&x.st.includes('أعلى'))notes.push('الهيكل صاعد واضح (قمم وقيعان أعلى) يدعم الاتجاه الإيجابي.');
  else if(x.dir==='هابط'&&x.st.includes('أدنى')){notes.push('الهيكل هابط واضح. أي شراء حالي ضد الاتجاه الرئيسي.');risks.push('الشراء ضد الاتجاه الهابط عالي المخاطرة.')}
  else notes.push('الهيكل متذبذب أو غير واضح. السوق في حالة تردد.');
  if(h){
    if(h.dir==='صاعد'&&x.dir==='صاعد')notes.push('توافق بين الإطار الحالي والأكبر → يدعم قوة الإشارة.');
    else if(h.dir==='هابط'&&x.dir==='صاعد'){notes.push('الإطار الأكبر هابط والحالي صاعد → قد يكون تصحيحاً داخل اتجاه هابط.');risks.push('احتمال فشل الارتفاع والعودة للهبوط.')}
    else if(h.dir==='هابط')risks.push('الإطار الأكبر هابط يضعف أي إشارة شراء.');
  }
  if(x.rsi>70){notes.push(`RSI مرتفع (${x.rsi.toFixed(1)}): تشبع شرائي واحتمال تصحيح.`);if(d.v==='شراء')risks.push('الدخول عند تشبع شرائي يزيد خطر التراجع السريع.')}
  else if(x.rsi<30){notes.push(`RSI منخفض (${x.rsi.toFixed(1)}): تشبع بيعي وقد يحدث ارتداد فني.`);if(d.v==='شراء')recs.push('الارتداد من التشبع البيعي يعطي أفضلية نسبية مع وقف صارم.')}
  else if(x.rsi>=50&&x.rsi<=65)notes.push('RSI في منطقة قوة معتدلة وصحية للاتجاه الصاعد.');
  if(x.vr>1.5)notes.push(`الحجم أعلى من المتوسط (${x.vr.toFixed(2)}×) → تأكيد أقوى للحركة.`);
  else if(x.vr<.7)notes.push('الحجم ضعيف نسبياً → الحركة قد تفتقر للقناعة.');
  if(x.atrPct<.4){notes.push('التذبذب منخفض جداً (ضغط سعري) وقد يسبق حركة قوية.');recs.push('راقب كسر النطاق بأحد الاتجاهين مع ارتفاع الحجم.')}
  else if(x.atrPct>3.5){notes.push('التذبذب مرتفع: استخدم وقفاً أوسع أو قلّل حجم المركز.');risks.push('التذبذب العالي يزيد احتمال لمس الوقف.')}
  if(x.lv.res[0]&&(x.lv.res[0].p-x.px)/x.px<.03)notes.push(`مقاومة قريبة عند ${fmt(x.lv.res[0].p)} قد تواجه رفضاً.`);
  if(x.lv.sup[0]&&(x.px-x.lv.sup[0].p)/x.px<.025)notes.push(`الدعم القريب عند ${fmt(x.lv.sup[0].p)} مهم، وكسره يضعف الصورة.`);
  if(d.v==='شراء'&&d.plan){
    recs.push(`الدخول قرب ${fmt(d.plan.e)} مع وقف تحت ${fmt(d.plan.s)}.`,`الهدف الأول ${fmt(d.plan.t[0])} (يمكن جني جزء من الأرباح عنده).`,`الهدف الثاني ${fmt(d.plan.t[1])}؛ بعد بلوغ الهدف الأول انقل الوقف إلى سعر الدخول.`);
    if(d.plan.rr&&d.plan.rr>=1.8)recs.push('نسبة العائد إلى المخاطرة جيدة نسبياً.');
    recs.push('لا تضف للمركز إلا بعد تأكيد الاستمرار فوق مستوى الدخول.');
  }else if(d.v==='تجنّب'){
    recs.push('يُفضل البقاء خارج الصفقة حالياً.');
    if(d.exitLvl)recs.push(`من يملك السهم: راقب الإغلاق تحت ${fmt(d.exitLvl)}.`);
    recs.push(`لا تفكر في الشراء قبل استعادة ${fmt(x.e50)} (EMA50) والإغلاق فوقها.`,'انتظر تحسن الهيكل أو عودة التوافق مع الإطار الأكبر.');
  }else{
    recs.push('لا توجد أفضلية واضحة للدخول الآن.');
    const r1=x.lv.res[0],s1=x.lv.sup[0];
    if(r1){const e=r1.p+.1*x.a,st=r1.p-x.a,t1=e+1.6*(e-st);recs.push(`سيناريو الاختراق: إغلاق فوق ${fmt(r1.p)} بحجم جيد → دخول قرب ${fmt(e)}، وقف تحت ${fmt(st)}، هدف أول ${fmt(t1)}.`)}
    if(s1)recs.push(`سيناريو الارتداد: مراقبة دعم ${fmt(s1.p)}؛ لا شراء إلا مع شمعة انعكاسية وتحسن RSI، بوقف تحت ${fmt(s1.p-.28*x.a)}. وإغلاق تحت ${fmt(s1.p-.28*x.a)} يلغي الفكرة.`);
    if(!r1&&!s1)recs.push('انتظر تكوّن مستويات دعم ومقاومة أوضح.');
  }
  recs.push('أعد التقييم عند إغلاق جديد أو تغير واضح في الحجم أو الهيكل.');
  notes.push(`المتوسطات: EMA20 عند ${fmt(x.e20)} وEMA50 عند ${fmt(x.e50)}${x.e200?` وEMA200 عند ${fmt(x.e200)}`:''}. الحركة المعتادة للشمعة ≈ ${fmt(x.a)}.`);
  return{notes,risks,recs};
}
function shortRec(d,x){
  if(d.limited)return x.coverage?.stale?'تاريخ قديم — قراءة غير حاسمة':`بيانات محدودة ${x.coverage?.bars||0}/${FULL_DECISION_BARS}`;
  if(d.v==='شراء'&&d.plan)return`دخول ${fmt(d.plan.e)} | وقف ${fmt(d.plan.s)}`;
  if(d.v==='تجنّب')return x.dir==='هابط'?'هبوط قوي — تجنّب':'تجنّب الشراء حالياً';
  return x.lv.res[0]?`انتظر إغلاقاً فوق ${fmt(x.lv.res[0].p)}`:'انتظر تأكيد أفضل';
}
