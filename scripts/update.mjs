// 매일 미국 장 마감 후 실행: tickers.json의 모든 티커 직전 정규장 종가를 data.json에 기록
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('tickers.json', 'utf8'));
const prev = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json', 'utf8')) : { prices: {}, names: {} };
const syms = [...new Set(Object.entries(cfg.pairs).flatMap(([l, p]) => [l, p.u]))];
const UA = { 'User-Agent': 'Mozilla/5.0 (lev-etf-data updater)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function lastClose(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10d&interval=1d`, { headers: UA });
      if (!r.ok) continue;
      const res = (await r.json()).chart?.result?.[0];
      if (!res?.timestamp) continue;
      const q = res.indicators.quote[0];
      let bars = res.timestamp.map((t, i) => ({ t, c: q.close[i] })).filter(b => b.c != null);
      const reg = res.meta.currentTradingPeriod?.regular;
      const now = Date.now() / 1000;
      // 정규장 진행 중이면 오늘 막대(미확정)는 제외
      if (reg && now < reg.end && bars.length && bars.at(-1).t >= reg.start - 3600) bars = bars.slice(0, -1);
      const b = bars.at(-1);
      if (!b) continue;
      const d = new Date((b.t + res.meta.gmtoffset) * 1000).toISOString().slice(0, 10);
      return { c: +b.c.toFixed(4), d, name: res.meta.longName || res.meta.shortName || '' };
    } catch (e) { await sleep(500); }
  }
  return null;
}
const prices = {}, names = { ...(prev.names || {}) };
let ok = 0, fail = [];
for (const s of syms) {
  const v = await lastClose(s);
  if (v) { prices[s] = { c: v.c, d: v.d }; if (v.name) names[s] = v.name; ok++; }
  else { if (prev.prices?.[s]) prices[s] = prev.prices[s]; fail.push(s); }
  await sleep(150);
}
const out = { updated: new Date().toISOString(), source: 'Yahoo Finance (비공식, 지연 가능)', pairs: cfg.pairs, proxy: cfg.proxy, names, prices };
fs.writeFileSync('data.json', JSON.stringify(out));
console.log(`ok ${ok}/${syms.length}`, fail.length ? 'fail: ' + fail.join(',') : '');
if (ok < syms.length * 0.5) process.exit(1);
