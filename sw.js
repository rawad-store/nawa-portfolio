/* نواة PWA — كاش محلي للغلاف فقط، مع تحديث شبكي للنسخة المنشورة. */
const CACHE_NAME = 'nawa-pwa-shell-v11';
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = ['./','./index.html','./manifest.webmanifest','./data/vlmra-egp-history.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'].map(path => new URL(path, BASE_URL).href);
const isShell = url => /\/(index\.html|manifest\.webmanifest|sw\.js)$/.test(url.pathname) || url.href === BASE_URL.href;
// بيانات الأرشيف تُجلب من الشبكة أولاً حتى لا تتأخر نسخة واحدة عن المنشور (قاعدة «10 أيام» تعتمد عليها).
const isData = url => url.pathname.startsWith(BASE_URL.pathname + 'data/');

// تثبيت لا يفشل كله إذا غاب ملف واحد (أيقونة أو أرشيف) — كان addAll يُسقط التثبيت بالكامل.
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.allSettled(SHELL_URLS.map(u=>cache.add(u)));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(n=>n.startsWith('nawa-pwa-shell-')&&n!==CACHE_NAME).map(n=>caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return;
  const url=new URL(request.url); if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    if(isShell(url) || isData(url) || request.mode==='navigate') {
      try { const response=await fetch(request,{cache:'no-store'}); if(response.ok) cache.put(request,response.clone()).catch(()=>{}); return response; }
      catch(_) { return (await cache.match(request,{ignoreSearch:true})) || (await cache.match(new URL('./index.html',BASE_URL).href)) || Response.error(); }
    }
    const cached=await cache.match(request);
    if(cached) { fetch(request).then(r=>{if(r.ok)cache.put(request,r.clone()).catch(()=>{});}).catch(()=>{}); return cached; }
    try { const response=await fetch(request); if(response.ok)cache.put(request,response.clone()).catch(()=>{}); return response; }
    catch(_) { return Response.error(); }
  })());
});
