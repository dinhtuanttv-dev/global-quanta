// Kiểm định đặt trước WS-r2 (backend/src/market/worldSectors/WS-r2-prereg.md). Chỉ đọc nguồn công khai (Yahoo, VNDirect, Gateway).
//   node backend/scripts/ws-r2-validate.mjs --out backend/src/market/worldSectors/WS-r2-result.json [--cache <thư mục đệm giá VNDirect>]
import fs from "node:fs";
import path from "node:path";
import { COMMODITY_DRIVERS, instrumentsFor, VN_SECTORS } from "../src/market/worldSectors/catalog.js";
import { createWorldSectorService } from "../src/market/worldSectors/worldSectorService.js";
import { createCommodityService } from "../src/market/commodities/commodityService.js";
import { prepare, spearman } from "../src/market/worldSectors/wsValidate.js";
import { sectorReturns, sectorScores, stockMatrix, testH5, testH6, testH7, verdict, WS_R2 } from "../src/market/worldSectors/wsR2.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = arg("--out"), cache = arg("--cache");
const G = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
const j = async (u) => { const r = await fetch(G + u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };
// Lịch sử Yahoo 10 năm (WS-v1 dùng 5 năm) — chỉ kéo dài lịch sử, không đổi công thức.
const yahoo10y = (u, o) => fetch(String(u).replace(/([?&])range=[^&]+/, "$110y"), o);

const vnRows = (await j("/api/market/ohlcv?symbol=VNINDEX&range=max")).bars.filter((b) => !b.partial && b.close > 0).map((b) => [b.date, b.close]);
const days = vnRows.map((r) => r[0]).filter((d) => d >= "2018-06-01");
const vnMap = new Map(vnRows), vn = Float64Array.from(days, (d) => vnMap.get(d));

const svc = createWorldSectorService({ fetchImpl: yahoo10y, log: { warn() {} } });
const ser = await svc.series();
const instruments = Object.fromEntries(VN_SECTORS.map((s) => [s.icb, instrumentsFor(s.icb).map((i) => ({ region: i.region, match: i.match, p: prepare(ser.get(i.symbol)?.points ?? []) })).filter((i) => i.p.r.length > 300)]));
const cs = createCommodityService({ fetchImpl: yahoo10y, log: { warn() {} } });
const dailyDrivers = {};
for (const [icb, list] of Object.entries(COMMODITY_DRIVERS)) for (const [id, sign] of list) {
  const c = await cs.seriesOf(id);
  if (c?.freq === "day" && c.points?.length) (dailyDrivers[icb] ??= []).push({ sign, p: prepare(c.points) });
}
const firstForeign = Math.min(...Object.values(instruments).flat().map((i) => (i.p.dates[0] ? Date.parse(i.p.dates[0]) : Infinity)));

// Vũ trụ + ngành (taxonomy: l3 nếu thuộc 22 ngành, không thì l2 — đúng ws_stock).
const ICBS = VN_SECTORS.map((s) => s.icb);
const tickers = (await j("/api/fundamentals/kqkd/summary")).rows.map((r) => r.t);
const tax = (await j("/api/market/sectors/taxonomy")).symbols;
const sectorOf = {};
for (const t of tickers) { const s = tax[t]; const icb = s && (ICBS.includes(s.l3) ? s.l3 : ICBS.includes(s.l2) ? s.l2 : null); if (icb) sectorOf[t] = icb; }

// Giá VNDirect (adOpen, adClose, nmValue) từ 2018-06-01, có đệm đĩa.
const raw = {};
if (cache) fs.mkdirSync(cache, { recursive: true });
for (const t of Object.keys(sectorOf)) {
  const f = cache ? path.join(cache, `${t}.json`) : null;
  if (f && fs.existsSync(f)) { raw[t] = JSON.parse(fs.readFileSync(f, "utf8")); continue; }
  let rows = null;
  for (let a = 0; a < 3 && !rows; a++) {
    try {
      const r = await fetch(`https://api-finfo.vndirect.com.vn/v4/stock_prices?q=code:${t}~date:gte:2018-06-01&size=3000&sort=date:asc`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
      if (r.ok) rows = ((await r.json()).data ?? []).map((x) => ({ date: x.date, adOpen: x.adOpen, adClose: x.adClose, nmValue: x.nmValue }));
    } catch { /* thử lại */ }
    if (!rows) await new Promise((z) => setTimeout(z, 1500 * (a + 1)));
  }
  if (rows) { raw[t] = rows; if (f) fs.writeFileSync(f, JSON.stringify(rows)); }
}

const S = sectorScores({ days, instruments, dailyDrivers });
const M = stockMatrix(raw, days);
const R = sectorReturns(M, sectorOf, days);

// Kiểm tra dữ liệu (không phải giả thuyết): chỉ số ngành dựng vs chỉ số ngành Gateway (từ 03/2022).
const dataCheck = {};
for (const icb of ICBS) {
  try {
    const gw = new Map((await j(`/api/market/sectors/${icb}/history`)).index.filter((r) => r[1] > 0).map((r) => [r[0], r[1]]));
    const xs = [], ys = [];
    for (let i = 1; i < days.length; i++) { const a = gw.get(days[i - 1]), b = gw.get(days[i]), c = R[days[i]]?.[icb]; if (a > 0 && b > 0 && c != null) { xs.push(Math.log(b / a)); ys.push(c); } }
    const n = xs.length, mx = xs.reduce((p, q) => p + q, 0) / n, my = ys.reduce((p, q) => p + q, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
    dataCheck[icb] = { n, corr: n > 30 ? Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000 : null };
  } catch { dataCheck[icb] = { n: 0, corr: null }; }
}

const strip = ({ series, ...r }) => r;
const H5 = testH5({ S, days, R, vn, from: WS_R2.holdFrom, to: WS_R2.holdTo });
const H6 = testH6({ S, days, M, sectorOf, vn, from: WS_R2.holdFrom, to: WS_R2.holdTo });
const H7 = testH7({ S, days, M, sectorOf, from: WS_R2.h7From, to: WS_R2.h7To });
const v = verdict({ H5, H6, H7 });
const desc2023 = { H5: strip(testH5({ S, days, R, vn, from: "2023-01-01", to: "2026-12-31" })), H6: strip(testH6({ S, days, M, sectorOf, vn, from: "2023-01-01", to: "2026-12-31" })) };
const res = {
  prereg: "backend/src/market/worldSectors/WS-r2-prereg.md", ranAt: new Date().toISOString(),
  data: { vnDays: days.length, from: days[0], to: days.at(-1), firstForeign: Number.isFinite(firstForeign) ? new Date(firstForeign).toISOString().slice(0, 10) : null,
    stocks: Object.keys(raw).length, mapped: Object.keys(sectorOf).length, sectors: ICBS.length, instruments: Object.values(instruments).flat().length, dailyDrivers: Object.values(dailyDrivers).flat().length, dataCheck },
  H5: { ...strip(H5), ...v.H5 }, H6: { ...strip(H6), ...v.H6 }, H7: { ...strip(H7), ...v.H7 }, descriptive2023: desc2023,
};
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
const f = (x, d = 4) => (x == null ? "—" : Number(x).toFixed(d));
console.log(`dữ liệu: ${res.data.from} → ${res.data.to}, ${res.data.stocks} mã (${res.data.mapped} có ngành), nước ngoài từ ${res.data.firstForeign}, ${res.data.instruments} công cụ, ${res.data.dailyDrivers} hàng hoá`);
console.log("kiểm tra chỉ số ngành dựng vs Gateway:", Object.entries(dataCheck).map(([k, x]) => `${k}:${f(x.corr, 2)}`).join(" "));
for (const k of ["H5", "H6", "H7"]) { const x = res[k]; console.log(`${k}: IC ${f(x.mean)} t ${f(x.t, 2)} (NW ${f(x.tNw ?? x.t, 2)}) p_Holm ${f(x.pHolm)} n ${x.n} nửa [${x.halves.map((h) => f(h)).join(", ")}] ${x.from}→${x.to} ${x.pass ? "ĐẠT" : "KHÔNG ĐẠT"}${k === "H7" ? ` · chênh 1/3 trên − dưới ${f(x.tercileSpread * 100, 3)}%/phiên` : ""}`); }
console.log(`mô tả 2023+: H5 IC ${f(desc2023.H5.mean)} t ${f(desc2023.H5.t, 2)} · H6 IC ${f(desc2023.H6.mean)} t ${f(desc2023.H6.t, 2)}`);
