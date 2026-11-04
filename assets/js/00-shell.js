const $=id=>document.getElementById(id);
const PAGE_META={
  analyze:['تحليل فني','قراءة فنية منظمة، مع توضيح مصدر السعر وحداثة الشموع وحدود العينة.'],
  holdings:['محفظتي الفعلية','ملكية فعلية مستقلة عن قائمة المتابعة، مع متوسط التكلفة والربح غير المحقق.'],
  portfolio:['قائمة المتابعة','قائمة مستقلة للتحليل والمراقبة؛ لا تغيّر كميات الملكية الفعلية.'],
  history:['سجل التحليلات','استعرض القراءات السابقة ومصدر السعر وتاريخ التحليل.'],
  settings:['الإعدادات','إدارة مصدر الأسعار والنسخ الاحتياطي والبيانات المحفوظة على هذا الجهاز.']
};
function setPageMeta(key){
  const meta=PAGE_META[key]||PAGE_META.analyze;
  if($('pageTitle'))$('pageTitle').textContent=meta[0];
  if($('pageDescription'))$('pageDescription').textContent=meta[1];
  document.title=meta[0]+' | نواة';
}
function applyTheme(theme,save=true){
  const next=theme==='light'?'light':'dark';
  document.documentElement.dataset.theme=next;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=next==='light'?'#edf2f5':'#07111d';
  const label=next==='dark'?'الوضع الفاتح':'الوضع الداكن';
  const button=$('themeToggle'),text=$('themeLabel');
  if(text)text.textContent=label;
  if(button){button.setAttribute('aria-label','التبديل إلى '+label);button.setAttribute('title','التبديل إلى '+label);button.setAttribute('aria-pressed',next==='light'?'true':'false')}
  if(save){try{localStorage.setItem('u_theme_v1',next)}catch(e){}}
}
try{applyTheme(localStorage.getItem('u_theme_v1')||'dark',false)}catch(e){applyTheme('dark',false)}
if($('themeToggle'))$('themeToggle').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
function updateNetworkState(){
  const offline=!navigator.onLine,status=$('netStatus'),text=$('netText'),notice=$('offlineNotice');
  if(status){status.classList.toggle('offline',offline);status.setAttribute('aria-label',offline?'دون اتصال بالإنترنت':'متصل بالإنترنت')}
  if(text)text.textContent=offline?'دون اتصال':'متصل بالإنترنت';
  if(notice)notice.hidden=!offline;
}
addEventListener('online',updateNetworkState);addEventListener('offline',updateNetworkState);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{n=Number(n);if(!isFinite(n))return'—';const a=Math.abs(n);return n.toLocaleString('en-US',{maximumFractionDigits:a<1?6:a<10?4:a<10000?2:0})};
let tt;const toast=(m,err=false)=>{const t=$('toast');if(!t)return;t.textContent=m;t.style.borderColor=err?'var(--dn)':'var(--bd)';t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3200)};
const ms=(t,err=false)=>{const el=$('ms');if(!el)return;el.textContent=t;el.style.color=err?'var(--dn)':''};

let last=null,PORT_RES={};
let MY_PORTFOLIO=[];
const EGX=[
  ['ABUK','أبوقير للأسمدة'],['AMOC','الإسكندرية للزيوت'],['VLMRA','فالمر القابضة'],['MPCI','ممفيس للأدوية'],
  ['SUGR','الدلتا للسكر'],['MICH','مصر للكيماويات'],['ETEL','المصرية للاتصالات'],['OLFI','عبور لاند'],
  ['SWDY','السويدي إليكتريك'],['EGAL','مصر للألومنيوم'],['POUL','القاهرة للدواجن'],['KZPC','كفر الزيات'],
  ['ORWE','النساجون الشرقيون'],['ORAS','أوراسكوم للإنشاء'],['MASR','مدينة مصر'],['COMI','البنك التجاري الدولي'],
  ['HRHO','إي إف جي هيرميس'],['TMGH','طلعت مصطفى'],['EAST','الشرقية للدخان'],['EFIH','إي فاينانس'],
  ['FWRY','فوري'],['ADIB','أبوظبي الإسلامي'],['JUFO','جهينة'],['EMFD','إعمار مصر'],['OCDI','سوديك']
];
const egxlEl=$('egxl');if(egxlEl)egxlEl.innerHTML=EGX.map(e=>`<option value="${e[0]}">${esc(e[1])}</option>`).join('');

// ===== Storage =====
const DEFAULT_PROXY='https://yahoo-proxy.tarek500500.workers.dev/';
const MARKET_CACHE_KEY='u_market_quotes_v1';
const marketKey=s=>String(s||'').trim().toUpperCase().replace(/\.CA$/,'');
function saveMarketQuote(sym,q){
  if(!q||!(+q.price>0)||!isFinite(+q.price)||q.source==='يدوي'||q.source==='ذاكرة محلية')return;
  try{
    const all=JSON.parse(localStorage.getItem(MARKET_CACHE_KEY)||'{}');
    all[marketKey(sym)]={price:+q.price,prev:q.prev>0?+q.prev:null,chgPct:q.chgPct!=null&&isFinite(+q.chgPct)?+q.chgPct:null,time:+q.time||Date.now(),cachedAt:Date.now(),status:q.status||'محفوظ',source:q.source||'مصدر خارجي',open:q.open>0?+q.open:null,high:q.high>0?+q.high:null,low:q.low>0?+q.low:null,vol:q.vol>0?+q.vol:null};
    const entries=Object.entries(all).sort((a,b)=>(b[1].cachedAt||0)-(a[1].cachedAt||0)).slice(0,200);
    localStorage.setItem(MARKET_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
  }catch(e){}
}
function getCachedMarketQuote(sym){
  try{const q=JSON.parse(localStorage.getItem(MARKET_CACHE_KEY)||'{}')[marketKey(sym)];if(q&&q.price>0)return{...q,originalSource:q.source,source:'ذاكرة محلية',status:'غير متصل',cached:true,time:q.time||q.cachedAt||Date.now()}}catch(e){}
  return null;
}
const PORT_KEY='u_portfolio_v4';
const syncPortfolio=()=>{try{localStorage.setItem(PORT_KEY,JSON.stringify(MY_PORTFOLIO))}catch(e){}};
try{
  const s=JSON.parse(localStorage.getItem(PORT_KEY)||'null');
  if(Array.isArray(s))MY_PORTFOLIO=s.filter(x=>typeof x==='string'&&x.trim());
  const cap=localStorage.getItem('u_cap');if(cap&&$('ac'))$('ac').value=cap;
  let px=localStorage.getItem('u_px');
  if(!px||!px.trim()){px=DEFAULT_PROXY;try{localStorage.setItem('u_px',px)}catch(e){}}
  if($('px'))$('px').value=px;
}catch(e){if($('px'))$('px').value=DEFAULT_PROXY}
function savePortfolio(){syncPortfolio();updatePortCount()}
if($('ac'))$('ac').addEventListener('change',()=>{try{localStorage.setItem('u_cap',$('ac').value)}catch(e){}});
if($('px'))$('px').addEventListener('input',()=>{try{localStorage.setItem('u_px',$('px').value.trim()||DEFAULT_PROXY)}catch(e){}});

// ===== Tabs =====
document.querySelectorAll('.tab[data-tab]').forEach(tab=>{tab.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');
  ['analyze','portfolio','history','settings'].forEach(id=>{const el=$('tab-'+id),active=tab.dataset.tab===id;if(el){el.style.display=active?'block':'none';el.setAttribute('aria-hidden',active?'false':'true')}});
  setPageMeta(tab.dataset.tab);
  if(tab.dataset.tab==='portfolio'){updatePortCount();renderPortList()}
  if(tab.dataset.tab==='history')rh();
  const pn=document.getElementById('tab-holdings');if(pn)pn.style.display='none';
  const holdTab=document.querySelector('.tab[data-hold]');if(holdTab)holdTab.classList.remove('active');
});});

// ===== Portfolio management (watchlist) =====
function updatePortCount(){const el=$('portCount');if(el)el.textContent=`(${MY_PORTFOLIO.length} سهم)`}
const getName=sym=>EGX.find(e=>e[0]===sym)?.[1]||sym;
function renderPortList(){
  const l=$('portList');if(!l)return;
  if(!MY_PORTFOLIO.length){l.innerHTML='<p class="mu">المحفظة فارغة. أضف أسهماً بالأسفل.</p>';return}
  l.innerHTML=MY_PORTFOLIO.map((s,i)=>`<div class="pi"><span class="mu" style="width:22px">${i+1}</span><span class="sym ltr">${esc(s)}</span><span class="name">${esc(getName(s))}</span><button class="sec sm dn" data-del="${i}">حذف</button></div>`).join('');
  l.querySelectorAll('[data-del]').forEach(b=>{b.onclick=()=>{const r=MY_PORTFOLIO.splice(+b.dataset.del,1)[0];savePortfolio();renderPortList();if(window.__syncRefFromPortfolio)window.__syncRefFromPortfolio();toast('تم حذف '+r)}});
}
if($('toggleEdit'))$('toggleEdit').onclick=()=>{const ed=$('portEditor');if(!ed)return;const show=ed.style.display==='none';ed.style.display=show?'block':'none';$('toggleEdit').textContent=show?'إخفاء التعديل':'تعديل القائمة';if(show)renderPortList()};
if($('addSym'))$('addSym').onclick=()=>{
  let v=$('newSym').value.trim();if(!v)return toast('اكتب رمزاً',true);
  const hit=EGX.find(e=>e[1]===v);v=hit?hit[0]:v.toUpperCase().replace(/\s+/g,'');
  try{detectAsset(v)}catch(e){return toast(e.message,true)}
  if(MY_PORTFOLIO.includes(v))return toast('الرمز موجود مسبقاً',true);
  MY_PORTFOLIO.push(v);savePortfolio();$('newSym').value='';renderPortList();
  if(window.__syncRefFromPortfolio)window.__syncRefFromPortfolio();
  toast('تمت إضافة '+v);
};
if($('newSym'))$('newSym').addEventListener('keydown',e=>{if(e.key==='Enter')$('addSym').click()});
if($('clearPort'))$('clearPort').onclick=()=>{if(MY_PORTFOLIO.length&&confirm('هل أنت متأكد من مسح كل الأسهم؟')){MY_PORTFOLIO=[];savePortfolio();renderPortList();if(window.__syncRefFromPortfolio)window.__syncRefFromPortfolio();toast('تم مسح المحفظة')}};

// ===== Asset detection =====
function detectAsset(raw){
  const s=String(raw||'').trim();if(!s)throw Error('اكتب الرمز');
  const hit=EGX.find(e=>e[0]===s.toUpperCase()||e[1]===s);
  if(hit)return{type:'egx',yahoo:hit[0]+'.CA',label:hit[0]+'.CA',name:hit[1]};
  const up=s.toUpperCase().replace(/\s+/g,'');
  if(/^[A-Z0-9\-]+\.CA$/.test(up))return{type:'egx',yahoo:up,label:up,name:up.replace('.CA','')};
  if(/^[A-Z0-9]{2,12}(USDT|USDC|BUSD|FDUSD)$/.test(up))return{type:'crypto',binance:up,label:up,name:up};
  if(/^[A-Z]{6}=X$/.test(up))return{type:'fx',yahoo:up,label:up,name:up.replace('=X','')};
  if(/^[A-Z0-9.\-]{1,12}$/.test(up))return{type:'stock',yahoo:up,label:up,name:up};
  throw Error('رمز غير صالح');
}

setPageMeta('analyze');
