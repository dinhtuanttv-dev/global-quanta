// Top 20 v2 (T1) — KHO YẾU TỐ theo thời điểm (point-in-time). Danh sách & định nghĩa CHỐT theo quy tắc T3 người dùng duyệt 2026-10-10.
// Mọi yếu tố tại ngày lịch c chỉ dùng dữ liệu ≤ c; BCTC chỉ dùng quý có ngày công bố (createdDate VNDirect) < ngày c.
// Hướng: giá trị LỚN = tốt theo lý thuyết (đảo chiều 5 phiên và biến động đã đổi dấu). Hàm thuần — không I/O.

export const FACTORS = Object.freeze([
  // giá (6)
  { key: "mom12_1", group: "price", name: "Momentum 12-1" },
  { key: "mom6_1", group: "price", name: "Momentum 6-1" },
  { key: "resRs63", group: "price", name: "RS phần dư 63 phiên (trừ beta thị trường & ngành)" },
  { key: "high52", group: "price", name: "Gần đỉnh 52 tuần" },
  { key: "trend", group: "price", name: "Trend Template (0–6)" },
  { key: "lowVol60", group: "price", name: "Biến động thấp 60 phiên" },
  // dòng tiền (5)
  { key: "foreign20", group: "flow", name: "Khối ngoại ròng 20 phiên / GTGD" },
  { key: "foreign60", group: "flow", name: "Khối ngoại ròng 60 phiên / GTGD" },
  { key: "valueTrend", group: "flow", name: "GTGD 20/250" },
  { key: "cmf20", group: "flow", name: "CMF-20 theo GTGD" },
  { key: "rev5", group: "flow", name: "Đảo chiều 5 phiên" },
  // cơ bản (6)
  { key: "npYoY", group: "fund", name: "Tăng trưởng LNST quý (cùng kỳ)" },
  { key: "revYoY", group: "fund", name: "Tăng trưởng doanh thu quý (cùng kỳ)" },
  { key: "npAccel", group: "fund", name: "Gia tốc tăng trưởng LNST" },
  { key: "roe", group: "fund", name: "ROE 4 quý" },
  { key: "ep", group: "fund", name: "LNST 4 quý / vốn hóa (E/P)" },
  { key: "npTtmG", group: "fund", name: "Tăng trưởng LNST 4 quý" },
  // ngành (1)
  { key: "sectorRs63", group: "sector", name: "RS 3 tháng của ngành ICB cấp 2" },
]);
export const K = FACTORS.length;
export const MIN_VALUE = 5e9;
export const HORIZONS = Object.freeze([5, 10, 20, 40, 60]);

const DAY = 864e5;
const ln = Math.log;
const clip = (x, a, b) => (Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : NaN);
const value = (b) => (b.value > 0 ? b.value : (b.volume ?? 0) * b.close);

/**
 * Chuẩn bị dữ liệu: lịch = phiên VN-Index; từng mã căn theo lịch; BCTC theo quý (sắp theo ngày công bố);
 * khối ngoại & vốn hoá theo ngày; tổng lợi suất ngày theo ngành (để tính lợi suất ngành trừ chính mã).
 * fundOf: Map ticker -> [{ fiscal, created, revenue, npat, liabilities, equity }]
 * foreignOf: Map ticker -> Map(date -> netVal);  mcapOf: Map ticker -> [[date, value]] (tăng dần)
 */
export function prepareAlpha({ seriesOf, benchBars, sectorOf, fundOf = new Map(), foreignOf = new Map(), mcapOf = new Map() }) {
  const dates = benchBars.map((b) => b.date), closes = benchBars.map((b) => b.close);
  const calOf = new Map(dates.map((d, i) => [d, i]));
  const N = dates.length;
  const mktRet = new Float64Array(N).fill(NaN);
  for (let i = 1; i < N; i++) mktRet[i] = ln(closes[i] / closes[i - 1]);
  const items = [];
  for (const [ticker, raw] of seriesOf) {
    const bars = raw.filter((b) => b.close > 0 && calOf.has(b.date));
    if (bars.length < 260) continue;
    const n = bars.length;
    const it = {
      ticker, sector: sectorOf.get(ticker) ?? null,
      dates: bars.map((b) => b.date), c: Float64Array.from(bars, (b) => b.close),
      h: Float64Array.from(bars, (b) => b.high || b.close), l: Float64Array.from(bars, (b) => b.low || b.close),
      val: Float64Array.from(bars, value), cal: Int32Array.from(bars, (b) => calOf.get(b.date)),
      foreign: new Float64Array(n).fill(NaN), mcap: new Float64Array(n).fill(NaN), ret: new Float64Array(n).fill(NaN),
      fund: (fundOf.get(ticker) ?? []).map((q) => ({ ...q, avail: availDate(q) })).filter((q) => q.avail).sort((a, b) => a.avail.localeCompare(b.avail)),
    };
    for (let e = 1; e < n; e++) it.ret[e] = ln(it.c[e] / it.c[e - 1]);
    const fm = foreignOf.get(ticker);
    if (fm) for (let e = 0; e < n; e++) { const v = fm.get(it.dates[e]); if (Number.isFinite(v)) it.foreign[e] = v; }
    const mc = mcapOf.get(ticker);
    if (mc?.length) { let k = 0; for (let e = 0; e < n; e++) { while (k + 1 < mc.length && mc[k + 1][0] <= it.dates[e]) k++; if (mc[k][0] <= it.dates[e]) it.mcap[e] = mc[k][1]; } }
    it.pos = new Map(Array.from(it.cal, (c, e) => [c, e]));
    items.push(it);
  }
  // tổng & số mã có lợi suất theo (ngành, ngày lịch) -> lợi suất ngành trừ chính mã
  const secSum = new Map(), secCnt = new Map();
  for (const it of items) {
    if (!it.sector) continue;
    if (!secSum.has(it.sector)) { secSum.set(it.sector, new Float64Array(N)); secCnt.set(it.sector, new Int32Array(N)); }
    const S = secSum.get(it.sector), C = secCnt.get(it.sector);
    for (let e = 1; e < it.c.length; e++) { S[it.cal[e]] += it.ret[e]; C[it.cal[e]]++; }
  }
  return { cal: { dates, closes, calOf, mktRet }, items, secSum, secCnt };
}

/** Ngày dữ liệu quý được coi là đã công bố: createdDate VNDirect; thiếu -> hết quý + 45 ngày (Q4: + 90). */
export function availDate(q) {
  if (q.created) return q.created;
  if (!q.fiscal) return null;
  const t = Date.parse(`${q.fiscal}T00:00:00Z`), m = Number(q.fiscal.slice(5, 7));
  return new Date(t + (m === 12 ? 90 : 45) * DAY).toISOString().slice(0, 10);
}

const qKey = (fiscal) => `${fiscal.slice(0, 4)}-${Math.ceil(Number(fiscal.slice(5, 7)) / 3)}`;
const prevYearKey = (fiscal) => `${Number(fiscal.slice(0, 4)) - 1}-${Math.ceil(Number(fiscal.slice(5, 7)) / 3)}`;
const growth = (x, x0) => (Number.isFinite(x) && Number.isFinite(x0) && Math.abs(x0) > 0 ? clip((x - x0) / Math.abs(x0), -5, 5) : NaN);

/** 6 yếu tố cơ bản tại ngày `date` (chỉ quý có avail < date). */
export function fundamentalFactors(fund, date, mcap) {
  const out = { npYoY: NaN, revYoY: NaN, npAccel: NaN, roe: NaN, ep: NaN, npTtmG: NaN };
  const avail = fund.filter((q) => q.avail < date);
  if (!avail.length) return out;
  const byKey = new Map();
  for (const q of avail) byKey.set(qKey(q.fiscal), q); // bản công bố muộn hơn ghi đè (cùng quý)
  const qs = [...byKey.values()].sort((a, b) => b.fiscal.localeCompare(a.fiscal));
  const q0 = qs[0], q1 = qs[1];
  const yoy = (q, f) => (q ? growth(q[f], byKey.get(prevYearKey(q.fiscal))?.[f]) : NaN);
  out.npYoY = yoy(q0, "npat"); out.revYoY = yoy(q0, "revenue");
  const g1 = yoy(q1, "npat"); out.npAccel = Number.isFinite(out.npYoY) && Number.isFinite(g1) ? clip(out.npYoY - g1, -5, 5) : NaN;
  const ttm = (k) => { const s = qs.slice(k, k + 4); return s.length === 4 && s.every((x) => Number.isFinite(x.npat)) ? s.reduce((a, x) => a + x.npat, 0) : NaN; };
  const t0 = ttm(0), t1 = ttm(4);
  out.npTtmG = growth(t0, t1);
  const eq0 = q0.equity, eq4 = qs[4]?.equity ?? qs[3]?.equity;
  const eqAvg = Number.isFinite(eq0) && eq0 > 0 ? (Number.isFinite(eq4) && eq4 > 0 ? (eq0 + eq4) / 2 : eq0) : NaN;
  out.roe = Number.isFinite(t0) && eqAvg > 0 ? clip(t0 / eqAvg, -2, 2) : NaN;
  out.ep = Number.isFinite(t0) && mcap > 0 ? clip(t0 / mcap, -1, 1) : NaN;
  return out;
}

/** RS phần dư 63 phiên: hồi quy lợi suất ngày 252 phiên lên thị trường & ngành (trừ chính mã), cộng phần dư 63 phiên cuối. */
function residualRs(it, e, data) {
  if (e < 253) return NaN;
  const { mktRet } = data.cal, S = it.sector ? data.secSum.get(it.sector) : null, C = it.sector ? data.secCnt.get(it.sector) : null;
  const xs = [], ys = [], ss = [];
  for (let i = e - 251; i <= e; i++) {
    const c = it.cal[i], m = mktRet[c], r = it.ret[i];
    let s = 0;
    if (S && C[c] > 1) s = (S[c] - r) / (C[c] - 1);
    if (!Number.isFinite(m) || !Number.isFinite(r)) continue;
    xs.push(m); ss.push(s); ys.push(r);
  }
  const n = xs.length; if (n < 200) return NaN;
  // OLS 2 biến (có hệ số chặn) bằng phương trình chuẩn
  const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  const mx = mean(xs), ms = mean(ss), my = mean(ys);
  let sxx = 0, sss = 0, sxs = 0, sxy = 0, ssy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ss[i] - ms, y = ys[i] - my; sxx += a * a; sss += b * b; sxs += a * b; sxy += a * y; ssy += b * y; }
  const det = sxx * sss - sxs * sxs;
  let bm, bs;
  if (Math.abs(det) < 1e-12) { bm = sxx > 0 ? sxy / sxx : 0; bs = 0; } else { bm = (sxy * sss - ssy * sxs) / det; bs = (ssy * sxx - sxy * sxs) / det; }
  const alpha = my - bm * mx - bs * ms;
  let res = 0;
  for (let k = n - 63; k < n; k++) res += ys[k] - alpha - bm * xs[k] - bs * ss[k];
  return res;
}

/**
 * Giá trị thô 18 yếu tố cho mọi mã đủ thanh khoản tại ngày lịch `ce` (+ kết quả tương lai nếu có, cho kiểm định).
 * Trả [{ ticker, sector, e, avgValue60, raw: Float64Array(K), y: { h5, h10, h20, h40, h60 } }].
 */
export function factorRows(data, ce, { minValue = MIN_VALUE, withOutcomes = true } = {}) {
  const { cal } = data, date = cal.dates[ce], rows = [];
  // RS 3 tháng ngành: trung bình lợi suất log 63 phiên của các mã cùng ngành có mặt tại ce
  const secRs = new Map();
  for (const it of data.items) {
    const e = it.pos.get(ce); if (e == null || e < 63 || !it.sector) continue;
    const r = ln(it.c[e] / it.c[e - 63]); const s = secRs.get(it.sector) ?? [0, 0]; s[0] += r; s[1]++; secRs.set(it.sector, s);
  }
  const vniRs = ce >= 63 ? ln(cal.closes[ce] / cal.closes[ce - 63]) : NaN;
  for (const it of data.items) {
    const e = it.pos.get(ce); if (e == null || e < 252) continue;
    let v60 = 0; for (let i = e - 59; i <= e; i++) v60 += it.val[i];
    const avgValue60 = v60 / 60; if (avgValue60 < minValue) continue;
    const c = it.c, raw = new Float64Array(K).fill(NaN);
    raw[0] = ln(c[e - 21] / c[e - 252]);
    raw[1] = ln(c[e - 21] / c[e - 126]);
    raw[2] = residualRs(it, e, data);
    let hi = 0; for (let i = e - 249; i <= e; i++) hi = Math.max(hi, c[i]); raw[3] = c[e] / hi;
    const ma = (n) => { let s = 0; for (let i = e - n + 1; i <= e; i++) s += c[i]; return s / n; };
    const ma200b = (() => { let s = 0; for (let i = e - 220; i < e - 20; i++) s += c[i]; return s / 200; })();
    const m50 = ma(50), m150 = ma(150), m200 = ma(200);
    raw[4] = (c[e] > m150) + (c[e] > m200) + (m150 > m200) + (m200 > ma200b) + (m50 > m150) + (c[e] > m50);
    { let s = 0, s2 = 0; for (let i = e - 59; i <= e; i++) { s += it.ret[i]; s2 += it.ret[i] ** 2; } const m = s / 60; raw[5] = -Math.sqrt(Math.max(s2 / 60 - m * m, 0)); }
    const fsum = (n) => { let s = 0, k = 0; for (let i = e - n + 1; i <= e; i++) if (Number.isFinite(it.foreign[i])) { s += it.foreign[i]; k++; } return k >= n * 0.75 ? s / (avgValue60 * n) : NaN; };
    raw[6] = fsum(20); raw[7] = fsum(60);
    { let a = 0, b = 0; for (let i = e - 19; i <= e; i++) a += it.val[i]; for (let i = e - 249; i <= e; i++) b += it.val[i]; raw[8] = a > 0 && b > 0 ? ln((a / 20) / (b / 250)) : NaN; }
    { let num = 0, den = 0; for (let i = e - 19; i <= e; i++) { const r = it.h[i] - it.l[i]; const mfm = r > 0 ? ((c[i] - it.l[i]) - (it.h[i] - c[i])) / r : 0; num += mfm * it.val[i]; den += it.val[i]; } raw[9] = den > 0 ? num / den : NaN; }
    raw[10] = -ln(c[e] / c[e - 5]);
    const fa = fundamentalFactors(it.fund, date, it.mcap[e]);
    raw[11] = fa.npYoY; raw[12] = fa.revYoY; raw[13] = fa.npAccel; raw[14] = fa.roe; raw[15] = fa.ep; raw[16] = fa.npTtmG;
    const sr = it.sector ? secRs.get(it.sector) : null;
    raw[17] = sr && sr[1] >= 2 && Number.isFinite(vniRs) ? sr[0] / sr[1] - vniRs : NaN;
    const row = { ticker: it.ticker, sector: it.sector, e, avgValue60, raw };
    if (withOutcomes) {
      row.y = {};
      for (const h of HORIZONS) {
        const a = e + 1, b = e + 1 + h;
        row.y[`h${h}`] = b < c.length ? ln(c[b] / c[a]) - ln(cal.closes[it.cal[b]] / cal.closes[it.cal[a]]) : null;
      }
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- chuẩn hoá cắt ngang

function invNorm(p) { // Acklam
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q != null && p < 0.5) return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (q != null) return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  const r = p - 0.5, t = r * r;
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
}
export { invNorm };

/**
 * Chuẩn hoá theo ngày: cắt biên 1%/99% -> hạng -> phân vị chuẩn (Gaussian rank); thiếu = 0 (trung tính);
 * trung hoà theo ngành (trừ TB ngành với ngành ≥ 3 mã) rồi chuẩn hoá lại độ lệch chuẩn. Ghi row.z (Float64Array K).
 */
export function normalizeRows(rows, { sectorNeutral = true } = {}) {
  const n = rows.length;
  for (const r of rows) r.z = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    const idx = rows.map((r, i) => i).filter((i) => Number.isFinite(rows[i].raw[k]));
    if (idx.length < 10) continue;
    const vals = idx.map((i) => rows[i].raw[k]).sort((a, b) => a - b);
    const lo = vals[Math.floor(0.01 * (vals.length - 1))], hi = vals[Math.ceil(0.99 * (vals.length - 1))];
    const w = idx.map((i) => clip(rows[i].raw[k], lo, hi));
    const ord = idx.map((_, j) => j).sort((a, b) => w[a] - w[b]);
    // hạng trung bình cho giá trị trùng
    for (let t = 0; t < ord.length;) { let u = t; while (u + 1 < ord.length && w[ord[u + 1]] === w[ord[t]]) u++; const rk = (t + u) / 2; for (let v = t; v <= u; v++) rows[idx[ord[v]]].z[k] = invNorm((rk + 0.5) / ord.length); t = u + 1; }
  }
  if (sectorNeutral) {
    const bySec = new Map();
    rows.forEach((r, i) => { if (r.sector) { if (!bySec.has(r.sector)) bySec.set(r.sector, []); bySec.get(r.sector).push(i); } });
    for (let k = 0; k < K; k++) {
      for (const ids of bySec.values()) { if (ids.length < 3) continue; const m = ids.reduce((s, i) => s + rows[i].z[k], 0) / ids.length; for (const i of ids) rows[i].z[k] -= m; }
      let s2 = 0; for (const r of rows) s2 += r.z[k] ** 2;
      const sd = Math.sqrt(s2 / Math.max(n, 1));
      if (sd > 0) for (const r of rows) r.z[k] /= sd;
    }
  }
  return rows;
}
