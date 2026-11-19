/* Cloudflare Worker: وسيط بسيط لتطبيق «نواة» لجلب خبر «أخبار البورصة اليوم» من اليوم السابع.
   الاستخدام من التطبيق:  https://YOUR-WORKER.workers.dev/?url=<رابط مُرمَّز>
   - يقبل مضيفين محددين فقط (قائمة بيضاء) فلا يصلح وسيطًا مفتوحًا لغيرك.
   - يضيف ترويسة CORS ويخزّن الردّ مؤقتًا 10 دقائق لتخفيف الطلبات. */
const ALLOW = ['youm7.com', 'www.youm7.com', 'egx.com.eg', 'www.egx.com.eg'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });
    const target = new URL(request.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: CORS }); }
    if (u.protocol !== 'https:' || !ALLOW.includes(u.hostname)) return new Response('host not allowed', { status: 403, headers: CORS });

    const cache = caches.default;
    const key = new Request(u.toString(), { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(u.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NawaBot/1.0)', 'Accept-Language': 'ar,en;q=0.8' },
        cf: { cacheTtl: 600, cacheEverything: true },
      });
      res = new Response(up.body, { status: up.status, headers: { 'Content-Type': up.headers.get('Content-Type') || 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(CORS).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
