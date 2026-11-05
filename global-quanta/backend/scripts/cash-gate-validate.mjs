// CG-r1 — chạy kiểm định đăng ký trước (src/market/cashGate/CG-prereg.md) trên dữ liệu thật và ghi báo cáo.
//   node scripts/cash-gate-validate.mjs
// Chuỗi chính: E1VFVN30 (VNDirect stock_prices adClose) 06/10/2014 → 31/10/2021. Độ bền: VN-Index (VNDirect) 24/08/2017 → 31/10/2021.
// VIX, VIX3M: Yahoo. Mọi quy tắc và tiêu chí nằm trong cashGateCore.js; script chỉ lấy dữ liệu và ghi kết quả.
import fs from "node:fs";
import { CG, CG_VERSION, RULES, runSeries, verdict } from "../src/market/cashGate/cashGateCore.js";

const END = "2021-10-31";
const UA = { "user-agent": "Mozilla/5.0" };
const OUT = new URL("../src/market/cashGate/cg-r1-report.json", import.meta.url);

async function vndirect(path, code, dateField = "date") {
  const rows = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`https://api-finfo.vndirect.com.vn/v4/${path}?sort=${dateField}:asc&size=1000&page=${page}&q=code:${code}`, { headers: UA });
    const j = await r.json();
    rows.push(...j.data);
    if (page >= j.totalPages) break;
  }
  return rows;
}
async function yahoo(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=1325376000&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, { headers: UA });
  const j = (await r.json()).chart.result[0];
  return j.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), j.indicators.quote[0].close[i]]).filter(([, c]) => c > 0);
}
const toSeries = (rows, field) => {
  const m = new Map();
  for (const x of rows) { const v = Number(x[field]); if (v > 0) m.set(x.date, v); }
  const dates = [...m.keys()].sort();
  return { dates, closes: dates.map((d) => m.get(d)) };
};

const [etfRows, vnRows, vix, vix3m] = await Promise.all([vndirect("stock_prices", "E1VFVN30"), vndirect("vnmarket_prices", "VNINDEX"), yahoo("^VIX"), yahoo("^VIX3M")]);
const etf = toSeries(etfRows, "adClose"), vn = toSeries(vnRows, "close");
console.log(`E1VFVN30 ${etf.dates.length} phiên ${etf.dates[0]}→${etf.dates.at(-1)} · VN-Index ${vn.dates.length} phiên ${vn.dates[0]}→ · VIX ${vix.length} · VIX3M ${vix3m.length}`);

const main = runSeries(etf, { vix, vix3m, end: END });
const robust = runSeries(vn, { vix, vix3m, end: END, bootstrap: false });
const cash0 = runSeries(etf, { vix, vix3m, end: END, bootstrap: false, cashYield: 0 });
const v = verdict(main, robust);

const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
console.log(`\nChuỗi chính ${main.period.from}→${main.period.to} (${main.period.sessions} phiên) · B luôn 100%: lợi suất năm ${pct(main.base.cagr)} · sụt giảm tối đa ${pct(main.base.mdd)} · Sharpe ${main.base.sharpe.toFixed(2)}`);
for (const id of RULES) {
  const r = main.rules[id], c = v[id];
  console.log(`${id.padEnd(4)} năm ${pct(r.cagr)} · sụt ${pct(r.mdd)} · Sharpe ${r.sharpe.toFixed(2)} (Δ ${r.deltaSharpe >= 0 ? "+" : ""}${r.deltaSharpe.toFixed(3)}, p ${r.p.toFixed(4)}, Holm ${c.pHolm.toFixed(4)}) · giảm tỷ trọng ${pct(r.pctReduced, 0)} thời gian, ${r.episodes} đợt, ${r.switches} lần đổi`);
  console.log(`     C1 ${c.C1 ? "đạt" : "KHÔNG"} · C2 ${c.C2 ? "đạt" : "KHÔNG"} · C3 ${c.C3 ? "đạt" : "KHÔNG"} · C4 ${c.C4 ? "đạt" : "KHÔNG"} (VN-Index ΔSharpe ${robust.rules[id].deltaSharpe.toFixed(3)}) => ${c.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
}
const report = {
  version: CG_VERSION, prereg: "backend/src/market/cashGate/CG-prereg.md", ranAt: new Date().toISOString(), params: CG,
  data: { main: { source: "VNDirect stock_prices E1VFVN30 adClose", sessions: etf.dates.length, first: etf.dates[0] }, robust: { source: "VNDirect vnmarket_prices VNINDEX close", sessions: vn.dates.length, first: vn.dates[0] }, vix: vix.length, vix3m: vix3m.length },
  main, robust, sensitivityCash0: { base: cash0.base, rules: Object.fromEntries(RULES.map((id) => [id, { cagr: cash0.rules[id].cagr, mdd: cash0.rules[id].mdd, deltaSharpe: cash0.rules[id].deltaSharpe }])) },
  verdict: v,
  summaryVi: RULES.some((id) => v[id].pass)
    ? `ĐẠT: ${RULES.filter((id) => v[id].pass).join(", ")}.`
    : "KHÔNG ĐẠT: không quy tắc nào đủ cả bốn tiêu chí đăng ký trước. Elite 10 giữ 100% cổ phiếu; thẻ chỉ hiển thị trạng thái cổng (mô tả).",
};
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.summaryVi}\nĐã ghi ${OUT.pathname}`);
