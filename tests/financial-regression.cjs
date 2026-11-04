const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const holdings = fs.readFileSync(path.join(root, 'assets/js/30-holdings.js'), 'utf8');
const calcSource = holdings.match(/function calc\(rows\)\s*\{[\s\S]*?\n\}/);
assert.ok(calcSource, 'portfolio calc function must exist');
const calcContext = {};
vm.runInNewContext(`${calcSource[0]}\nglobalThis.calc = calc;`, calcContext);

const rows = [
  {sym: 'AAA', qty: 10, avgCost: 8, sector: 'A', q: {price: 12, prev: 10}},
  {sym: 'BBB', qty: 5, avgCost: 10, sector: 'B', q: {price: 9, prev: 9.5}}
];
const result = calcContext.calc(rows);
assert.equal(result.tot, 165, 'market value');
assert.equal(result.prevTot, 147.5, 'previous-day base value');
assert.equal(result.chg, 17.5, 'daily change');
assert.equal(result.invested, 130, 'cost basis');
assert.equal(result.unrealized, 35, 'unrealized P/L');
assert.ok(Math.abs(result.unrealizedPct - 100 * 35 / 130) < 1e-10, 'unrealized P/L percent');
assert.equal(result.complete, true);
assert.equal(result.chgComplete, true);
assert.ok(Math.abs(rows[0].w + rows[1].w - 100) < 1e-10, 'position weights sum to 100%');

const unknownCost = calcContext.calc([
  {sym: 'KNOWN', qty: 10, avgCost: 8, sector: 'A', q: {price: 12, prev: 10}},
  {sym: 'UNK', qty: 5, avgCost: 0, sector: 'B', q: {price: 10, prev: 9}},
  {sym: 'NOQ', qty: 3, avgCost: 5, sector: 'C', q: {err: 'offline'}}
]);
assert.equal(unknownCost.invested, 95, 'known cost basis includes known positions even when one quote is unavailable');
assert.equal(unknownCost.pnlInvested, 80, 'unrealized P/L denominator includes only priced positions with known cost');
assert.equal(unknownCost.unrealized, 40, 'unknown cost and unpriced positions are excluded from unrealized P/L');
assert.equal(unknownCost.unrealizedPct, 50);
assert.equal(unknownCost.unknownCostCount, 1);
assert.equal(unknownCost.missingCostPriceCount, 1);
assert.equal(unknownCost.unknownCostValue, 50, 'market value remains separate from unknown cost basis');
assert.equal(unknownCost.unrealizedComplete, false, 'incomplete cost or quote data must label aggregate P/L partial');
assert.equal(unknownCost.ok[1].upl, null, 'unknown cost basis cannot display per-position P/L');
const allUnknownCost = calcContext.calc([{sym: 'ONLY', qty: 5, avgCost: 0, sector: 'A', q: {price: 11, prev: 10}}]);
assert.equal(allUnknownCost.unrealized, null, 'no known cost basis must not display zero or market value as P/L');
assert.equal(allUnknownCost.unknownCostValue, 55);

const invalidChange = calcContext.calc([{sym: 'CCC', qty: 1, avgCost: 0, sector: 'C', q: {price: 5, chgPct: -100}}]);
assert.equal(invalidChange.pct, null, 'a -100% quote cannot create a zero-denominator prior value');
assert.equal(invalidChange.noPrev, 1);
assert.equal(invalidChange.chgComplete, false);

const partial = calcContext.calc([
  {sym: 'AAA', qty: 2, avgCost: 3, sector: 'A', q: {price: 4, prev: 4}},
  {sym: 'BBB', qty: 1, avgCost: 5, sector: 'B', q: {err: 'offline'}}
]);
assert.equal(partial.tot, 8);
assert.equal(partial.missing, 1);
assert.equal(partial.complete, false, 'incomplete quotes must not look like a complete portfolio');

const analysisSource = fs.readFileSync(path.join(root, 'assets/js/20-analysis.js'), 'utf8');
const analysisContext = {Date, Math, Error, dayStamp: () => new Date().toISOString().slice(0, 10)};
vm.runInNewContext(`${analysisSource}\nglobalThis.study = study; globalThis.decideWithCoverage = decideWithCoverage;`, analysisContext);
function bars(n, asOf = new Date().toISOString().slice(0, 10)) {
  const out = Array.from({length: n}, (_, i) => {
    const c = 20 + i * 0.12 + Math.sin(i / 2) * 0.08;
    return {t: Date.now() - (n - i) * 86400000, o: c - 0.04, h: c + 0.3, l: c - 0.3, c, v: 1000 + i * 10};
  });
  out._historyMeta = {asOf, source: 'test fixture'};
  return out;
}
const five = analysisContext.study(bars(5));
assert.equal(five.coverage.bars, 5);
assert.equal(five.coverage.periods.rsi, 4);
assert.equal(five.coverage.decisionReady, false);
const initial = analysisContext.decideWithCoverage(five, null, 0.4);
assert.equal(initial.v, 'انتظار');
assert.equal(initial.plan, null);
assert.equal(initial.limited, true);
assert.equal(analysisContext.study(bars(59)).coverage.decisionReady, false);
assert.equal(analysisContext.study(bars(60)).coverage.decisionReady, true);
assert.equal(analysisContext.study(bars(60, '2000-01-01')).coverage.decisionReady, false, 'stale histories cannot create a decisive signal');
assert.throws(() => analysisContext.study(bars(4)), /5 شموع على الأقل/);

const market = fs.readFileSync(path.join(root, 'assets/js/10-market-data.js'), 'utf8');
const validSource = market.match(/function validOhlcBar\(b\)\s*\{[\s\S]*?\n\}/);
const filterSource = market.match(/function filterOhlcBars\(bars,meta=\{\}\)\s*\{[\s\S]*?\n\}/);
const parseSource = market.match(/function parseYahoo\(j\)\s*\{[\s\S]*?\n\}/);
assert.ok(validSource && filterSource && parseSource, 'Yahoo OHLC validation functions must exist');
const parserContext = {};
vm.runInNewContext(`${validSource[0]}\n${filterSource[0]}\n${parseSource[0]}\nglobalThis.parseYahoo=parseYahoo;`, parserContext);
const parsed = parserContext.parseYahoo({chart:{result:[{timestamp:[1700000000,1700000060,1700000120,1700000180,1700000240],indicators:{quote:[{open:[10,12,10,10,11],high:[11,11,11,12,12],low:[9,9,9,9,10],close:[10.5,10,8,11,11.5],volume:[1,2,3,4,5]}]}}]}});
assert.equal(parsed.length, 3, 'Yahoo candles with open or close outside the low/high range are excluded');
assert.equal(parsed._sourceQuality.rawRecordCount, 5);
assert.equal(parsed._sourceQuality.rejectedInvalidOhlc, 2);

const getCacheSource = market.match(/function getCache\(tk,tf,allowStale=false\)\s*\{[\s\S]*?\n\s*\}catch\(e\)\s*\{\s*return null;\s*\}\s*\n\}/);
assert.ok(getCacheSource, 'cached bars must be revalidated before use');
const cacheRows = Array.from({length:5}, (_,i) => ({t:1700000000000+i*86400000,o:10,h:11,l:9,c:10.5,v:100}));
const cacheFixture = {ts:Date.now(),source:'Yahoo Finance',asOf:'2026-11-04',rawRecordCount:6,d:[...cacheRows,{t:1700432000000,o:12,h:11,l:9,c:10,v:50}]};
const cacheStore = new Map([['fixture-cache',JSON.stringify(cacheFixture)]]);
const cacheContext = {
  localStorage:{getItem:k=>cacheStore.get(k)||null,setItem:(k,v)=>cacheStore.set(k,v),removeItem:k=>cacheStore.delete(k)},
  navigator:{onLine:false},ck:()=> 'fixture-cache',dayStamp:()=> '2026-11-04',
  annotateBars:(data,meta)=>{data._historyMeta=meta;return data;}
};
vm.runInNewContext(`${validSource[0]}\n${filterSource[0]}\n${getCacheSource[0]}\nglobalThis.getCache=getCache;`,cacheContext);
const repairedCache=cacheContext.getCache('TEST','1d');
const storedCache=JSON.parse(cacheStore.get('fixture-cache'));
assert.equal(repairedCache.length,5,'invalid cached bars must not enter technical analysis');
assert.equal(repairedCache._historyMeta.rejectedInvalidOhlc,1);
assert.equal(storedCache.d.length,5,'invalid legacy cache entry is removed from localStorage');
assert.equal(storedCache.rejectedInvalidOhlc,1,'cache quality metadata is preserved');

const ui = fs.readFileSync(path.join(root, 'assets/js/40-ui.js'), 'utf8');
const quoteSource = ui.match(/function quoteLabel\(live\)\s*\{[\s\S]*?\n\}/);
assert.ok(quoteSource, 'quote status label must exist');
const quoteContext = {};
vm.runInNewContext(`${quoteSource[0]}\nglobalThis.quoteLabel=quoteLabel;`, quoteContext);
assert.equal(quoteContext.quoteLabel({source:'TradingView', status:'متأخر'}), 'TradingView • متأخر');
assert.equal(quoteContext.quoteLabel({source:'يدوي'}), 'سعر يدوي');
assert.equal(quoteContext.quoteLabel({source:'ذاكرة محلية'}), 'آخر سعر مخزن');

console.log('Financial regressions passed: known/unknown cost basis, daily change, partial quotes, Yahoo OHLC validation, quote freshness labels, adaptive indicators and stale-data gate.');
