// PL-r1 (prereg: backend/src/market/research/impact/PL-r1-prereg.md) — doanh nghiệp ngang hàng nước ngoài đi trước ngành VN.
// Chạy MỘT LẦN trên mẫu ngoài (tuần kết thúc 2020-01-03 → tuần đầy đủ gần nhất có dữ liệu VN).
//   node backend/scripts/pl-r1-run.mjs --px <dir OHLC điều chỉnh, như gq-research/pit-ohlc/px> --index <VNINDEX.json>
// Ghi backend/src/market/research/impact/PL-r1-report.json; TỪ CHỐI chạy nếu tệp đã tồn tại.
import fs from "node:fs"; import path from "node:path";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPORT_FILE = path.join(HERE, "../src/market/research/impact/PL-r1-report.json");
if (fs.existsSync(REPORT_FILE)) { console.error("PL-r1 đã chạy (tệp báo cáo tồn tại) — từ chối chạy lại."); process.exit(1); }
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const PX = arg("px"), IDX = arg("index");

const VN = { re: ["VIC", "VHM", "NVL", "KDH", "DXG", "NLG", "PDR"], it: ["FPT", "CMG", "ELC"] };
const PEERS = { re: ["0688.HK", "0016.HK"], it: ["INFY", "WIT", "ACN"] };
const START_WEEK = "2020-01-03";

// ── dữ liệu VN (giá điều chỉnh = cột 4)
const vnRows = (t) => { try { return JSON.parse(fs.readFileSync(path.join(PX, `${t}.json`), "utf8")).filter((r) => r[4] > 0).map((r) => [r[0], r[4]]); } catch { return null; } };
const idx = JSON.parse(fs.readFileSync(IDX, "utf8")).filter((r) => r[4] > 0).map((r) => [r[0], r[4]]);
const lastVN = idx.at(-1)[0];
// tuần đầy đủ gần nhất: thứ Sáu ≤ ngày VN cuối cùng (nếu ngày cuối là thứ Sáu thì lấy tuần đó)
const fridays = []; for (let t = Date.parse(`${START_WEEK}T00:00:00Z`) - 7 * 864e5; ; t += 7 * 864e5) { const f = new Date(t).toISOString().slice(0, 10); if (f > lastVN) break; fridays.push(f); }

// ── Yahoo (giá điều chỉnh), từ 2019-10 để có tuần đầu
const UA = { "user-agent": "Mozilla/5.0", accept: "application/json" };
async function yahoo(sym) {
  const p1 = Math.floor(Date.parse("2019-10-01") / 1000), p2 = Math.floor(Date.now() / 1000);
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`, { headers: UA });
  const res = (await r.json())?.chart?.result?.[0]; if (!res) throw new Error(`Yahoo ${sym}`);
  const tz = res.meta.exchangeTimezoneName; const c = res.indicators.adjclose?.[0]?.adjclose ?? res.indicators.quote[0].close;
  const day = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t * 1000));
  return res.timestamp.map((t, i) => [day(t), c[i]]).filter((x) => x[1] > 0);
}
const weekly = (rows) => { const out = []; let k = 0; for (const f of fridays) { while (k + 1 < rows.length && rows[k + 1][0] <= f) k++; out.push(rows.length && rows[k][0] <= f ? rows[k][1] : null); } return out; };
const wret = (px) => px.map((p, i) => (i && px[i - 1] && p ? Math.log(p / px[i - 1]) : null));
const basket = (series) => fridays.map((_, i) => { const v = series.map((s) => s[i]).filter((x) => x != null && Math.abs(x) < 0.5); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const vniW = wret(weekly(idx));
const eemW = wret(weekly(await yahoo("EEM")));
const series = {};
for (const g of ["re", "it"]) {
  const vnB = basket(VN[g].map((t) => vnRows(t)).filter(Boolean).map((r) => wret(weekly(r))));
  const peerB = basket(await Promise.all(PEERS[g].map(async (s) => wret(weekly(await yahoo(s))))));
  series[g] = { vn: vnB.map((v, i) => (v != null && vniW[i] != null ? v - vniW[i] : null)), peer: peerB.map((v, i) => (v != null && eemW[i] != null ? v - eemW[i] : null)) };
}
// tuần đầu của mẫu ngoài = chỉ số của START_WEEK
const i0 = fridays.indexOf(START_WEEK);
function pairs(x, y, sumX, sumY, step) {
  const xs = [], ys = [];
  for (let i = i0 + sumX - 1; i + sumY < fridays.length; i += step) { const xa = x.slice(i - sumX + 1, i + 1), ya = y.slice(i + 1, i + 1 + sumY); if (i - sumX + 1 < i0 || xa.some((v) => v == null) || ya.some((v) => v == null)) continue; xs.push(xa.reduce((a, b) => a + b, 0)); ys.push(ya.reduce((a, b) => a + b, 0)); }
  return [xs, ys];
}
function test(g, sumX, sumY, step, minN) {
  const { vn, peer } = series[g]; const [x, y] = pairs(peer, vn, sumX, sumY, step); const n = x.length;
  const r = corr(x, y), t = r * Math.sqrt((n - 2) / (1 - r * r));
  // p dịch vòng một phía: dịch vòng chuỗi x đã ghép
  let ge = 0; for (let k = 0; k < 1000; k++) { const s = 26 + Math.floor(rnd() * Math.max(1, n - 52)); const xs = x.map((_, j) => x[(j + s) % n]); if (corr(xs, y) >= r) ge++; }
  const p = (ge + 1) / 1001; const h = Math.floor(n / 2);
  const sx = sd(x), big = y.filter((_, j) => x[j] >= sx);
  return { n, r, t, pShift: p, halfR: [corr(x.slice(0, h), y.slice(0, h)), corr(x.slice(h), y.slice(h))], bigSignalMeanPct: big.length ? mean(big) * 100 : null, bigSignalN: big.length, enough: n >= minN };
}
const a = test("re", 4, 4, 4, 40), b = test("it", 1, 1, 1, 150);
// Holm trong họ 2 thành viên
const ord = [["PL-r1a", a], ["PL-r1b", b]].sort((p, q) => p[1].pShift - q[1].pShift);
const holm = {}; let stop = false;
ord.forEach(([id, x], k) => { const thr = 0.05 / (2 - k); const ok = !stop && x.pShift <= thr; if (!ok) stop = true; holm[id] = { threshold: thr, pass: ok }; });
const verdict = (id, x) => (!x.enough ? "CHƯA ĐỦ MẪU" : x.r > 0 && x.t >= 2 && holm[id].pass && x.halfR.every((v) => v > 0) && x.bigSignalMeanPct > 0.45 ? "ĐẠT" : "KHÔNG ĐẠT");
const report = { prereg: "backend/src/market/research/impact/PL-r1-prereg.md", ranAt: new Date().toISOString(), sample: { firstWeek: START_WEEK, lastWeek: fridays.at(-1), lastVnData: lastVN },
  "PL-r1a": { ...a, holm: holm["PL-r1a"], verdict: verdict("PL-r1a", a) }, "PL-r1b": { ...b, holm: holm["PL-r1b"], verdict: verdict("PL-r1b", b) } };
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 1)); console.log(JSON.stringify(report, null, 1));
