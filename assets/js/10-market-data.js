// ===== Network =====
async function tfetch(url,timeout=13000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{return await fetch(url,{signal:ctrl.signal})}
  catch(e){throw Error(e.name==='AbortError'?'انتهت المهلة':'تعذّر الاتصال')}
  finally{clearTimeout(timer)}
}
async function viaProxy(url,custom,t=14000){
  const enc=encodeURIComponent(url),list=[];
  const px=(custom&&custom.trim())||(typeof DEFAULT_PROXY!=='undefined'?DEFAULT_PROXY:'')||'';
  if(px)list.push(px.replace(/\/+$/,'')+'/?url='+enc);
  list.push(`https://api.allorigins.win/raw?url=${enc}`,`https://corsproxy.io/?${enc}`,`https://api.codetabs.com/v1/proxy?quest=${enc}`);
  for(const p of list){try{const r=await tfetch(p,t);if(r.ok){const txt=await r.text();try{return JSON.parse(txt)}catch(e){continue}}}catch(e){}}
  try{const r=await tfetch(url,t);if(r.ok)return await r.json()}catch(e){}
  throw Error('تعذّر جلب البيانات. تأكد من وسيطك في الإعدادات أو أعد المحاولة.');
}
function validOhlcBar(b){
  const t=+b?.t,o=+b?.o,h=+b?.h,l=+b?.l,c=+b?.c;
  return [t,o,h,l,c].every(Number.isFinite)&&t>0&&o>0&&h>0&&l>0&&c>0&&h>=l&&l<=o&&o<=h&&l<=c&&c<=h;
}
function filterOhlcBars(bars,meta={}){
  const out=[];let invalid=0;
  for(const b of (Array.isArray(bars)?bars:[])){if(validOhlcBar(b))out.push(b);else invalid++}
  const raw=Number(meta.rawRecordCount);
  out._sourceQuality={rawRecordCount:Number.isFinite(raw)?raw:(Array.isArray(bars)?bars.length:0),rejectedInvalidOhlc:(Number(meta.rejectedInvalidOhlc)||0)+invalid,duplicateRowsRemoved:Number(meta.duplicateRowsRemoved)||0};
  return out;
}
function parseYahoo(j){
  const r=j?.chart?.result?.[0];if(!r)throw Error('استجابة غير متوقعة من المصدر');
  const q=r.indicators?.quote?.[0],ts=r.timestamp||[];
  if(!q||!ts.length)throw Error('لا توجد بيانات');
  const raw=[];
  ts.forEach((t,i)=>raw.push({t:+t*1000,o:+q.open?.[i],h:+q.high?.[i],l:+q.low?.[i],c:+q.close?.[i],v:Number.isFinite(+q.volume?.[i])&&+q.volume[i]>=0?+q.volume[i]:0}));
  return filterOhlcBars(raw,{rawRecordCount:ts.length});
}
const yahoo=async(tk,iv,rg,custom)=>parseYahoo(await viaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}?range=${rg}&interval=${iv}&includePrePost=false`,custom));

const _tvCache={};
async function tvQuote(sym,custom){
  const key=String(sym).replace(/\.CA$/,'');
  const hit=_tvCache[key];
  // كاش قصير (45 ثانية) لتقليل الضغط على الوسيط مع الحفاظ على حداثة السعر
  if(hit&&Date.now()-hit.ts<45000)return hit.q;
  const base=((custom&&custom.trim())||(typeof DEFAULT_PROXY!=='undefined'?DEFAULT_PROXY:'')||'').replace(/\/+$/,'');
  if(!base)return null;
  const r=await tfetch(base+'/tv?s='+encodeURIComponent(String(sym).replace(/\.CA$/,'')),10000);
  if(!r.ok)throw Error('TV '+r.status);
  const j=await r.json(),row=j?.data?.[0],d=row?.d;
  if(!Array.isArray(d)||!(d[0]>0))throw Error('TV empty');
  const price=+d[0];
  if(!(price>0)||!isFinite(price))throw Error('TV سعر غير صالح');
  const q={
    price,
    chgPct:d[1]!=null&&isFinite(+d[1])?+d[1]:null,
    vol:d[2]!=null&&isFinite(+d[2])?+d[2]:null,
    high:d[3]!=null&&isFinite(+d[3])?+d[3]:null,
    low:d[4]!=null&&isFinite(+d[4])?+d[4]:null,
    prev:d[5]!=null&&isFinite(+d[5])&&+d[5]>0?+d[5]:null,
    time:Date.now(),
    source:'TradingView',
    status:'متأخر'
  };
  _tvCache[key]={ts:Date.now(),q};return q;
}
async function getEgxMarketQuote(rawSymbol,custom){
  const symbol=String(rawSymbol||'').trim().toUpperCase().replace(/\.CA$/,''),ticker=symbol+'.CA';
  if(!symbol)return null;
  if(navigator.onLine===false)return getCachedMarketQuote(symbol);
  // مصدر السعر الحي الموحد: نفس TradingView عبر وسيط الإعدادات الذي تستخدمه محفظة الملكية.
  try{
    const q=await tvQuote(ticker,custom);
    if(q&&q.price>0){const out={price:q.price,prev:q.prev>0?q.prev:null,chgPct:q.chgPct,vol:q.vol,high:q.high,low:q.low,time:q.time||Date.now(),source:'TradingView',status:'متأخر'};saveMarketQuote(symbol,out);return out}
  }catch(e){}
  // Yahoo احتياطي للسعر اليومي، ثم آخر سعر محلي ناجح إن تعذر المصدران.
  try{
    const j=await viaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d&includePrePost=false`,custom,12000);
    const r=j?.chart?.result?.[0];if(!r)throw Error(j?.chart?.error?.description||'لا توجد بيانات تاريخية لهذا الرمز');
    const m=r.meta||{},qq=r.indicators?.quote?.[0]||{},ts=r.timestamp||[],bars=[];
    ts.forEach((t,i)=>{const c=qq.close?.[i];if(c>0&&isFinite(c))bars.push({t:t*1000,o:qq.open?.[i],h:qq.high?.[i],l:qq.low?.[i],c,v:qq.volume?.[i]})});
    const price=+m.regularMarketPrice;if(!bars.length||!(price>0))throw Error('لا توجد أسعار من Yahoo');
    const L=bars[bars.length-1],mt=(m.regularMarketTime||L.t/1000)*1000,same=dayEG(L.t)===dayEG(mt),prev=same?(bars.length>1?bars[bars.length-2].c:null):L.c,age=(Date.now()-mt)/60000;
    const out={price,prev:prev>0?prev:null,time:mt,status:age<=30?'متأخر':age<=7200?'آخر إغلاق':'تاريخي',source:'Yahoo (احتياطي)',open:same&&L.o>0?L.o:null,high:m.regularMarketDayHigh??(same&&L.h>0?L.h:null),low:m.regularMarketDayLow??(same&&L.l>0?L.l:null),vol:m.regularMarketVolume??(same?L.v:null)};
    saveMarketQuote(symbol,out);return out;
  }catch(e){return getCachedMarketQuote(symbol)}
}
async function getLivePrice(asset,custom){
  const symbol=asset.yahoo||asset.binance;
  if(navigator.onLine===false)return getCachedMarketQuote(symbol);
  if(asset.type==='crypto'){
    try{const r=await tfetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${asset.binance}`,8000);
      if(r.ok){const p=parseFloat((await r.json()).price);if(p>0){const q={price:p,time:Date.now(),source:'Binance'};saveMarketQuote(symbol,q);return q}}}catch(e){}
    return getCachedMarketQuote(symbol);
  }
  if(asset.type==='egx')return getEgxMarketQuote(symbol,custom);
  try{
    const j=await viaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.yahoo)}?range=1d&interval=1m`,custom,10000);
    const m=j?.chart?.result?.[0]?.meta;
    if(m?.regularMarketPrice>0){const q={price:+m.regularMarketPrice,time:(m.regularMarketTime||Date.now()/1000)*1000,source:'Yahoo'};saveMarketQuote(symbol,q);return q}
  }catch(e){}
  return getCachedMarketQuote(symbol);
}

const ck=(tk,tf)=>`u_y_${tk}_${tf}`;
const dayStamp=t=>t?new Date(t).toISOString().slice(0,10):null;
function annotateBars(d,meta={}){
  if(!Array.isArray(d))return d;
  const last=d[d.length-1];
  d._historyMeta={source:meta.source||d._historyMeta?.source||'مصدر تاريخي غير محدد',asOf:meta.asOf||d._historyMeta?.asOf||dayStamp(last?.t),retrievedAt:meta.retrievedAt||d._historyMeta?.retrievedAt||Date.now(),cached:!!meta.cached,rawRecordCount:meta.rawRecordCount||d._historyMeta?.rawRecordCount||null,rejectedInvalidOhlc:meta.rejectedInvalidOhlc||d._historyMeta?.rejectedInvalidOhlc||0,duplicateRowsRemoved:meta.duplicateRowsRemoved||d._historyMeta?.duplicateRowsRemoved||0};
  return d;
}
function getCache(tk,tf,allowStale=false){
  try{
    const key=ck(tk,tf),o=JSON.parse(localStorage.getItem(key));
    if(!o||!Array.isArray(o.d)||!o.d.length)return null;
    const stale=Date.now()-(o.ts||0)>=280000,oldLength=o.d.length,priorRejected=Number(o.rejectedInvalidOhlc)||0;
    const cleaned=filterOhlcBars(o.d,{rawRecordCount:Number.isFinite(+o.rawRecordCount)?+o.rawRecordCount:oldLength,rejectedInvalidOhlc:priorRejected,duplicateRowsRemoved:o.duplicateRowsRemoved});
    o.d=cleaned;
    o.rawRecordCount=cleaned._sourceQuality.rawRecordCount;
    o.rejectedInvalidOhlc=cleaned._sourceQuality.rejectedInvalidOhlc;
    o.duplicateRowsRemoved=cleaned._sourceQuality.duplicateRowsRemoved;
    if(cleaned.length!==oldLength){try{localStorage.setItem(key,JSON.stringify(o))}catch(e){}}
    if(!o.d.length){localStorage.removeItem(key);return null}
    if(!stale||allowStale||navigator.onLine===false){
      o.d._cacheTs=o.ts||0;o.d._cacheStale=stale;
      return annotateBars(o.d,{source:o.source||'Yahoo Finance (ذاكرة محلية)',asOf:o.asOf||dayStamp(o.d[o.d.length-1]?.t),retrievedAt:o.ts||0,cached:true,rawRecordCount:o.rawRecordCount,rejectedInvalidOhlc:o.rejectedInvalidOhlc,duplicateRowsRemoved:o.duplicateRowsRemoved});
    }
    return null;
  }catch(e){
    return null;
  }
}
function setCache(tk,tf,d,meta={}){
  annotateBars(d,meta);
  const h=d._historyMeta||{},v=JSON.stringify({ts:Date.now(),d,source:h.source,asOf:h.asOf,rawRecordCount:h.rawRecordCount,rejectedInvalidOhlc:h.rejectedInvalidOhlc,duplicateRowsRemoved:h.duplicateRowsRemoved});
  try{localStorage.setItem(ck(tk,tf),v)}catch(e){
    try{Object.keys(localStorage).filter(k=>k.startsWith('u_y_')).forEach(k=>localStorage.removeItem(k));localStorage.setItem(ck(tk,tf),v)}catch(e2){}}
}
let _valmoreEgpArchivePromise=null;
async function valmoreEgpHistory(tk,tf){
  if(String(tk).toUpperCase().replace(/\.CA$/,'')!=='VLMRA'||!['1d','1w'].includes(tf))return null;
  if(!_valmoreEgpArchivePromise)_valmoreEgpArchivePromise=(async()=>{const r=await tfetch('./data/vlmra-egp-history.json',15000);if(!r.ok)throw Error('تعذّر تحميل سجل Valmore المضمّن');const j=await r.json();if(j.symbol!=='VLMRA'||j.currency!=='EGP'||!Array.isArray(j.bars))throw Error('بيانات أرشيف VLMRA غير صالحة');return j})().catch(e=>{_valmoreEgpArchivePromise=null;throw e});
  const j=await _valmoreEgpArchivePromise;let data=filterOhlcBars(j.bars.map(b=>({t:+b.t,o:+b.o,h:+b.h,l:+b.l,c:+b.c,v:+b.v})),{rawRecordCount:j.rawRecordCount||j.bars.length,rejectedInvalidOhlc:j.rejectedInvalidOhlc,duplicateRowsRemoved:j.duplicateRowsRemoved});
  const quality=data._sourceQuality;
  if(tf==='1w'){
    const groups=new Map();
    for(const b of data){const dt=new Date(b.t),start=Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()-dt.getUTCDay()),k=String(start);let g=groups.get(k);if(!g){g={t:start,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v};groups.set(k,g)}else{g.h=Math.max(g.h,b.h);g.l=Math.min(g.l,b.l);g.c=b.c;g.v+=b.v}}
    data=[...groups.values()];
  }
  return annotateBars(data,{source:'علاقات المستثمرين — Valmore Holding (أرشيف يومي مضمّن)',asOf:j.asOf,retrievedAt:Date.parse(j.retrievedAt)||Date.now(),rawRecordCount:quality.rawRecordCount,rejectedInvalidOhlc:quality.rejectedInvalidOhlc,duplicateRowsRemoved:quality.duplicateRowsRemoved});
}
function agg4h(b){
  const out=[];let c=null;
  b.forEach(x=>{const k=Math.floor(x.t/14400000);
    if(!c||c.k!==k){if(c)out.push(c);c={k,t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}}
    else{c.h=Math.max(c.h,x.h);c.l=Math.min(c.l,x.l);c.c=x.c;c.v+=x.v}});
  if(c)out.push(c);
  return out.map(({t,o,h,l,c,v})=>({t,o,h,l,c,v}));
}
async function yCandles(tk,tf,custom){
  const cached=getCache(tk,tf);if(cached&&cached.length>=MIN_EXPLORATORY_BARS)return cached;
  const interval={'1h':'1h','4h':'1h','1d':'1d','1w':'1wk'}[tf]||'1d';
  const range={'1h':'1y','4h':'1y','1d':'3y','1w':'10y'}[tf]||'3y';
  let data,lastErr,quality;
  try{
    data=await yahoo(tk,interval,range,custom);
    quality=data._sourceQuality||{rawRecordCount:data.length,rejectedInvalidOhlc:0,duplicateRowsRemoved:0};
    if(tf==='4h')data=agg4h(data);
    if(data.length>=MIN_EXPLORATORY_BARS){annotateBars(data,{source:'Yahoo Finance',asOf:dayStamp(data[data.length-1].t),retrievedAt:Date.now(),rawRecordCount:quality.rawRecordCount,rejectedInvalidOhlc:quality.rejectedInvalidOhlc,duplicateRowsRemoved:quality.duplicateRowsRemoved});setCache(tk,tf,data,data._historyMeta);return data}
    lastErr=Error(`المصدر أعاد ${data.length} شموع OHLC صالحة فقط؛ يلزم ${MIN_EXPLORATORY_BARS} للقراءة الأولية${quality.rejectedInvalidOhlc?` (استُبعدت ${quality.rejectedInvalidOhlc} سجلات غير متسقة)`:''}`);
  }catch(e){lastErr=e}
  const old=getCache(tk,tf,true);if(old&&old.length>=MIN_EXPLORATORY_BARS)return old;
  try{const archive=await valmoreEgpHistory(tk,tf);if(archive&&archive.length){setCache(tk,tf,archive,archive._historyMeta);return archive}}catch(e){if(!lastErr)lastErr=e}
  throw lastErr||Error('لم تتوفر شموع تاريخية لهذا الرمز');
}
async function bCandles(sym,tf){
  const cached=getCache(sym,tf);if(cached&&cached.length>=MIN_EXPLORATORY_BARS)return cached;
  try{
    const r=await tfetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=500`);
    if(!r.ok)throw Error('رمز غير موجود في Binance');
    const j=await r.json();if(!Array.isArray(j))throw Error('استجابة شموع غير صالحة من Binance');
    const data=filterOhlcBars(j.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]})),{rawRecordCount:j.length}),quality=data._sourceQuality;
    if(data.length<MIN_EXPLORATORY_BARS)throw Error(`المتاح ${data.length} شموع OHLC صالحة؛ يلزم ${MIN_EXPLORATORY_BARS} للقراءة الأولية${quality.rejectedInvalidOhlc?` (استُبعدت ${quality.rejectedInvalidOhlc} سجلات غير متسقة)`:''}`);
    annotateBars(data,{source:'Binance',asOf:dayStamp(data[data.length-1].t),retrievedAt:Date.now(),rawRecordCount:quality.rawRecordCount,rejectedInvalidOhlc:quality.rejectedInvalidOhlc});setCache(sym,tf,data,data._historyMeta);return data;
  }catch(e){const old=getCache(sym,tf,true);if(old&&old.length>=MIN_EXPLORATORY_BARS)return old;throw e}
}
function alignBarsToLive(bars,live){
  if(!bars||!bars.length||!live||!(live.price>0))return{bars,aligned:false,factor:1};
  const lc=bars[bars.length-1].c;if(!(lc>0))return{bars,aligned:false,factor:1};
  const ratio=live.price/lc;
  if(Math.abs(ratio-1)<0.02)return{bars,aligned:false,factor:1};
  if(ratio>4||ratio<0.25)return{bars,aligned:false,factor:1,suspect:true};
  const scale=o=>({t:o.t,o:o.o*ratio,h:o.h*ratio,l:o.l*ratio,c:o.c*ratio,v:o.v});
  return{bars:bars.map(scale),aligned:true,factor:ratio};
}
async function loadAll(asset,tf,custom,manualPrice=null){
  const htf={'1h':'4h','4h':'1d','1d':'1w'}[tf],isC=asset.type==='crypto';
  const get=t=>isC?bCandles(asset.binance,t):yCandles(asset.yahoo,t,custom);
  const livePromise=manualPrice>0?Promise.resolve(null):getLivePrice(asset,custom).catch(()=>null);
  let bars;
  try{bars=await get(tf)}catch(e){
    const live=await livePromise;
    if(asset.type==='egx'&&String(asset.yahoo||'').toUpperCase().startsWith('VLMRA')&&!['1d','1w'].includes(tf))throw Error('الأرشيف الرسمي المتاح لـ VLMRA يومي فقط؛ لا تتوفر شموع تاريخية ساعية أو 4 ساعات، ولن تُصطنع من البيانات اليومية. اختر يوميًا أو أسبوعيًا.');
    if(!isC&&asset.type==='egx'&&live&&live.source==='TradingView'){
      throw Error(`وصل السعر الحي من TradingView (${fmt(live.price)} ج.م)، لكن لم تتوفر أي شموع تاريخية فعلية لهذا الرمز. السعر الحي وحده لا يكفي لحساب المؤشرات، ولم تُنشأ شموع افتراضية.`);
    }
    throw e;
  }
  const higherPromise=htf?get(htf).catch(()=>null):Promise.resolve(null);
  let [live,higher]=await Promise.all([livePromise,higherPromise]);
  if(manualPrice>0)live={price:+manualPrice,time:Date.now(),source:'يدوي'};
  if(!isC&&live&&live.source&&String(live.source).includes('TradingView')){
    const a=alignBarsToLive(bars,live);
    if(a.suspect)throw Error('البيانات التاريخية لهذا الرمز غير متوافقة مع السعر الحالي (قد يكون هناك تقسيم أو تعديل). جرّب مصدرًا آخر أو أدخل سعرًا يدويًا.');
    bars=a.bars;
    if(higher&&higher.length){const h=alignBarsToLive(higher,live);if(h.suspect)throw Error('بيانات الإطار الأكبر غير متوافقة مع السعر الحالي.');higher=h.bars}
    if(a.aligned)live={...live,aligned:true,alignFactor:+a.factor.toFixed(4)};
  }
  return{bars,live,higher};
}
