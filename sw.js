/* نواة PWA — كاش محلي للغلاف فقط، مع تحديث شبكي للنسخة المنشورة. */
const CACHE_NAME = 'nawa-pwa-shell-v7';
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = ['./','./index.html','./manifest.webmanifest','./data/vlmra-egp-history.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'].map(path => new URL(path, BASE_URL).href);
const isShell = url => /\/(index\.html|manifest\.webmanifest|sw\.js)$/.test(url.pathname) || url.href === new URL('./', BASE_URL).href;
self.addEventListener('install', event => event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME); await cache.addAll(SHELL_URLS); await self.skipWaiting();})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{const names=await caches.keys(); await Promise.all(names.filter(n=>n.startsWith('nawa-pwa-shell-')&&n!==CACHE_NAME).map(n=>caches.delete(n))); await self.clients.claim();})()));
self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return;
  const url=new URL(request.url); if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    if(isShell(url) || request.mode==='navigate') {
      try { const response=await fetch(request,{cache:'no-store'}); if(response.ok) cache.put(request,response.clone()).catch(()=>{}); return response; }
      catch(_) { return (await cache.match(request)) || (await cache.match(new URL('./index.html',BASE_URL).href)) || Response.error(); }
    }
    const cached=await cache.match(request);
    if(cached) { fetch(request).then(r=>{if(r.ok)cache.put(request,r.clone()).catch(()=>{});}).catch(()=>{}); return cached; }
    try { const response=await fetch(request); if(response.ok)cache.put(request,response.clone()).catch(()=>{}); return response; }
    catch(_) { return Response.error(); }
  })());
});
