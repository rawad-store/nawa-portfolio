const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const must = p => { if (!fs.existsSync(path.join(root, p))) throw new Error(`Missing ${p}`); };
['index.html','manifest.webmanifest','sw.js','README.md','data/vlmra-egp-history.json','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'].forEach(must);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const archive = JSON.parse(fs.readFileSync(path.join(root, 'data/vlmra-egp-history.json'), 'utf8'));
for (const marker of [
  "function portfolioSignal",
  "tvQuote('VLMRA.CA','')",
  "loadAll(asset,effectiveTf,custom,null)",
  'بيع / خفض',
  'احتفاظ / تعزيز مشروط',
  'u_hold_man_v1'
]) if (!html.includes(marker)) throw new Error(`Missing marker ${marker}`);
if (manifest.start_url !== './?source=pwa' || manifest.scope !== './') throw new Error('Invalid PWA scope/start_url');
if (!manifest.icons.some(x => x.sizes === '512x512' && x.purpose === 'maskable')) throw new Error('Missing maskable icon');
if (!/^nawa-pwa-shell-v\d+$/.test((sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '')) throw new Error('Invalid SW cache version');
if (archive.symbol !== 'VLMRA' || archive.currency !== 'EGP' || !Array.isArray(archive.bars) || archive.bars.length < 100) throw new Error('Invalid VLMRA archive');
for (const b of archive.bars) {
  if (![b.t,b.o,b.h,b.l,b.c].every(Number.isFinite) || !(b.t > 0 && b.o > 0 && b.h >= b.l && b.l <= b.o && b.o <= b.h && b.l <= b.c && b.c <= b.h)) throw new Error('Invalid OHLC bar');
}
console.log(`Release audit passed: ${archive.bars.length} VLMRA OHLC bars, ${manifest.icons.length} icons, ${sw.match(/nawa-pwa-shell-v\d+/)[0]}.`);
