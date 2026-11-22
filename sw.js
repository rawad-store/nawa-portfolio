/* نواة PWA — كاش محلي للغلاف فقط، مع تحديث شبكي للنسخة المنشورة. */
const CACHE_NAME = 'nawa-pwa-shell-v54';
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = ['./','./index.html','./manifest.webmanifest','./data/vlmra-egp-history.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'].map(path => new URL(path, BASE_URL).href);
const INDEX_URL = new URL('./index.html', BASE_URL).href;
const NET_TIMEOUT = 7000; // شبكة بطيئة: لا ننتظر أكثر من هذا قبل الرجوع للنسخة المحفوظة
const isShell = url => /\/(index\.html|manifest\.webmanifest|sw\.js)$/.test(url.pathname) || url.href === BASE_URL.href;
// بيانات الأرشيف تُجلب من الشبكة أولاً حتى لا تتأخر نسخة واحدة عن المنشور (قاعدة «10 أيام» تعتمد عليها).
const isData = url => url.pathname.startsWith(BASE_URL.pathname + 'data/');
const OFFLINE_HTML = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="font:16px system-ui;background:#0b1220;color:#e8eef8;padding:2rem;direction:rtl">التطبيق غير متاح دون اتصال حاليًا. افتحه مرة واحدة متصلًا ليُحفظ على الجهاز.</body>';

// تثبيت لا يفشل كله إذا غاب ملف واحد (أيقونة أو أرشيف). cache:'reload' يتجاوز كاش المتصفح فلا تُحفظ نسخة قديمة.
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.allSettled(SHELL_URLS.map(u=>cache.add(new Request(u,{cache:'reload'}))));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(n=>n.startsWith('nawa-pwa-shell-')&&n!==CACHE_NAME).map(n=>caches.delete(n)));
  await self.clients.claim();
})()));

// الشبكة أولاً بمهلة؛ يُرجع null عند الفشل أو خطأ خادم (5xx) أو بطء مفرط ليُستخدم المحفوظ.
// صفحات التنقل تُحفظ تحت مفتاح index.html واحد حتى لا تتراكم نسخ لكل رابط (?tab=…).
async function networkFirst(request, cache){
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),NET_TIMEOUT);
  try{
    const response=await fetch(request,{cache:'no-store',signal:ctrl.signal});
    if(response.status>=500) return null;
    if(response.ok) cache.put(request.mode==='navigate'?INDEX_URL:request,response.clone()).catch(()=>{});
    return response;
  }catch(_){ return null; }
  finally{ clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return;
  const url=new URL(request.url); if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME), nav=request.mode==='navigate';
    if(isShell(url) || isData(url) || nav) {
      const fresh=await networkFirst(request,cache);
      if(fresh) return fresh;
      const hit=await cache.match(nav?INDEX_URL:request,{ignoreSearch:true});
      if(hit) return hit;
      // الرجوع إلى index.html مخصص للتنقل فقط؛ إرجاعه لملف JSON أو أيقونة يكسر القارئ.
      return nav ? new Response(OFFLINE_HTML,{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}) : new Response('',{status:503});
    }
    const cached=await cache.match(request);
    if(cached) { fetch(request).then(r=>{if(r.ok)cache.put(request,r.clone()).catch(()=>{});}).catch(()=>{}); return cached; }
    try { const response=await fetch(request); if(response.ok)cache.put(request,response.clone()).catch(()=>{}); return response; }
    catch(_) { return Response.error(); }
  })());
});

// عند الضغط على إشعار استحقاق التوزيعات: افتح التطبيق المفتوح أو شغّله.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of list){ if(c.url.startsWith(BASE_URL.href) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(BASE_URL.href);
  })());
});

// السماح للصفحة بطلب التفعيل الفوري عند توفر نسخة جديدة.
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
