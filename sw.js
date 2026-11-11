/* نواة PWA — كاش محلي للغلاف فقط، مع تحديث شبكي للنسخة المنشورة. */
'use strict';

const CACHE_NAME = 'nawa-pwa-shell-v28';
const BASE_URL = new URL('./', self.location.href);
const SCOPE_PATH = BASE_URL.pathname;
const SHELL_URLS = [
  './', './index.html', './manifest.webmanifest',
  './data/vlmra-egp-history.json', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
].map(path => new URL(path, BASE_URL).href);
const INDEX_URL = new URL('./index.html', BASE_URL).href;
const OFFLINE_RESPONSE = new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;background:#0b1220;color:#e8eef8;padding:2rem;direction:rtl">التطبيق غير متاح دون اتصال حاليًا. افتحه مرة واحدة متصلًا ليُحفظ على الجهاز.</body>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);

const isInScope = url => url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH);
const isShell = url => /\/(index\.html|manifest\.webmanifest|sw\.js)$/.test(url.pathname) || url.href === BASE_URL.href;
const isData = url => url.pathname.startsWith(new URL('./data/', BASE_URL).pathname);

// المهلة تمنع انتظار اتصال متوقف؛ AbortController لا يغير الطلبات المخزنة.
async function fetchTimeout(request, options = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function cachedShell(cache, request) {
  return (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(INDEX_URL)) || null;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // لا يُسقط ملف أيقونة مفقود عملية تثبيت بقية الغلاف.
    await Promise.allSettled(SHELL_URLS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('nawa-pwa-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // لا نتدخل في الشبكات الخارجية أو الموارد الواقعة خارج مسار التطبيق.
  if (!isInScope(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const navigation = request.mode === 'navigate';
    const shellRequest = navigation || isShell(url);

    if (shellRequest || isData(url)) {
      try {
        const response = await fetchTimeout(request, { cache: 'no-store' }, 6000);
        if (response.ok) {
          const cacheKey = navigation ? INDEX_URL : request;
          cache.put(cacheKey, response.clone()).catch(() => {});
          return response;
        }
        // عند خطأ خادم أو صفحة غلاف غير موجودة مؤقتًا، أعطِ النسخة المخزنة فرصة.
        if (response.status >= 500 || (shellRequest && response.status === 404)) {
          const fallback = isData(url)
            ? await cache.match(request, { ignoreSearch: true })
            : await cachedShell(cache, navigation ? INDEX_URL : request);
          if (fallback) return fallback;
        }
        // لا نخفي 4xx للأرشيف؛ قد تكون إشارة فعلية إلى أن المورد غير منشور.
        return response;
      } catch (_) {
        const fallback = isData(url)
          ? await cache.match(request, { ignoreSearch: true })
          : await cachedShell(cache, navigation ? INDEX_URL : request);
        return fallback || (navigation ? OFFLINE_RESPONSE.clone() : Response.error());
      }
    }

    // الموارد المحلية الأخرى: استخدم النسخة المخزنة فورًا وحدّثها في الخلفية.
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
      }).catch(() => {});
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});

// الضغط على إشعار استحقاق التوزيعات يفتح التطبيق الحالي أو يبدأ نسخة جديدة.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(BASE_URL.href) && 'focus' in client) {
        try { client.postMessage({ type: 'OPEN_DIVS' }); } catch (_) {}
        return client.focus();
      }
    }
    return self.clients.openWindow(new URL('?tab=divs', BASE_URL).href);
  })());
});

// تسمح الصفحة بتفعيل النسخة المنتظرة يدويًا عند الحاجة.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
