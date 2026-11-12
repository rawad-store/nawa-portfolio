/* نواة PWA — كاش محلي للغلاف مع أولوية الشبكة ومهلة قصيرة، فلا ينتظر المستخدم على اتصال ضعيف. */
const CACHE_NAME = 'nawa-pwa-shell-v32';
const NET_TIMEOUT = 4500; // مللي ثانية قبل الرجوع إلى النسخة المحفوظة
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = ['./','./index.html','./manifest.webmanifest','./data/vlmra-egp-history.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'].map(path => new URL(path, BASE_URL).href);
const INDEX_URL = new URL('./index.html', BASE_URL).href;
const isShell = url => /\/(index\.html|manifest\.webmanifest|sw\.js)$/.test(url.pathname) || url.href === BASE_URL.href;
// بيانات الأرشيف من الشبكة أولاً حتى لا تتأخر نسخة عن المنشور (قاعدة «10 أيام» تعتمد عليها).
const isData = url => url.pathname.startsWith(BASE_URL.pathname + 'data/');

// التثبيت لا يفشل كله إذا غاب ملف واحد.
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.allSettled(SHELL_URLS.map(u=>cache.add(u)));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(n=>n.startsWith('nawa-pwa-shell-')&&n!==CACHE_NAME).map(n=>caches.delete(n)));
  if(self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(()=>{});
  await self.clients.claim();
})()));

// شبكة أولاً بمهلة؛ عند الفشل أو التأخر أو خطأ الخادم (5xx) تُقدَّم النسخة المحفوظة.
async function networkFirst(event, cache){
  const request=event.request;
  let bad=null; // استجابة 5xx تُعاد فقط إن لم توجد نسخة محفوظة
  const fromNet=(async()=>{
    const preload=await event.preloadResponse;
    const response=preload||await fetch(request,{cache:'no-store'});
    if(response&&response.status>=500){ bad=response; throw new Error('HTTP '+response.status); }
    if(response&&response.ok) cache.put(request,response.clone()).catch(()=>{});
    return response;
  })();
  // يُبقي العامل حيًا لإكمال التحديث في الخلفية حتى بعد تقديم النسخة المحفوظة عند المهلة.
  event.waitUntil(fromNet.catch(()=>{}));
  const fallback=async()=>(await cache.match(request,{ignoreSearch:true}))||(request.mode==='navigate'?await cache.match(INDEX_URL):null);
  let timer;
  const timeout=new Promise((_,rej)=>{ timer=setTimeout(()=>rej(new Error('timeout')),NET_TIMEOUT); });
  try{
    return await Promise.race([fromNet,timeout]);
  }catch(_){
    const cached=await fallback();
    if(cached) return cached;
    try{ return await fromNet; }catch(__){ return bad||Response.error(); }
  }finally{ clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return;
  const url=new URL(request.url); if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    if(isShell(url) || isData(url) || request.mode==='navigate') return networkFirst(event,cache);
    const cached=await cache.match(request);
    if(cached) { event.waitUntil(fetch(request).then(r=>{if(r.ok)return cache.put(request,r.clone());}).catch(()=>{})); return cached; }
    try { const response=await fetch(request); if(response.ok)cache.put(request,response.clone()).catch(()=>{}); return response; }
    catch(_) { return Response.error(); }
  })());
});

// الضغط على إشعار استحقاق التوزيعات: افتح التطبيق المفتوح أو شغّله.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const tag=(event.notification&&event.notification.tag)||'';
    const divs=/^([hxp]\||[su]-)/.test(tag);
    for(const c of list){ if(c.url.startsWith(BASE_URL.href) && 'focus' in c){ if(divs) c.postMessage({type:'OPEN_DIVS'}); return c.focus(); } }
    return self.clients.openWindow(divs ? BASE_URL.href+'?source=pwa&tab=divs' : BASE_URL.href);
  })());
});
