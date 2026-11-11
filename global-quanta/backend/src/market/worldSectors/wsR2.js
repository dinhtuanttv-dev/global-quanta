// WS-r2 (WS-r2-prereg.md, 11/11/2026) — kiểm định truyền dẫn thế giới tới cổ phiếu: H5 (ngành, sóng 5 phiên → 10 phiên),
// H6 (cổ phiếu, độ nhạy × sóng → 10 phiên), H7 (thời điểm trong phiên: điểm sáng sớm → mở cửa → đóng cửa). Hàm thuần.
import { aggregateZ, blend, nwMean, spearman, zShortAt } from "./wsValidate.js";
import { normCdf } from "../elite/icCore.js";

export const WS_R2 = Object.freeze({
  holdFrom: "2019-07-01", holdTo: "2022-12-31", h7From: "2019-07-01", h7To: "2026-11-10",
  waveDays: 5, horizon: 10, betaWin: 250, betaMin: 150, minAdv: 1e9, minSectors: 10, minStocks: 50, minSectorNames: 3,
  nwLong: 10, nwShort: 5, alpha: 0.025,
});

/** S[d][s] đúng H3 của WS-v1 cho các ngày `days`. */
export function sectorScores({ days, instruments, dailyDrivers }) {
  const S = {};
  for (const d of days) {
    const row = {};
    for (const [s, list] of Object.entries(instruments)) {
      const sec = aggregateZ((list ?? []).map((i) => ({ region: i.region, match: i.match, z: zShortAt(i.p, d) })));
      const cz = (dailyDrivers[s] ?? []).map((c) => { const z = zShortAt(c.p, d); return z == null ? null : z * c.sign; }).filter((z) => z != null);
      const v = blend(sec, cz.length ? cz.reduce((a, b) => a + b, 0) / cz.length : null);
      if (v != null && Number.isFinite(v)) row[s] = v;
    }
    S[d] = row;
  }
  return S;
}

/** Σ_{k=0..n−1} S[d−k][s] — cần đủ n phiên có điểm. */
export function wave(S, days, i, s, n = WS_R2.waveDays) {
  if (i < n - 1) return null;
  let sum = 0;
  for (let k = 0; k < n; k++) { const v = S[days[i - k]]?.[s]; if (v == null) return null; sum += v; }
  return sum;
}

/**
 * Bảng giá cổ phiếu căn theo lịch VN: { ticker: { o, c, v } } mảng Float64 theo chỉ số ngày; adv20[i] trung bình 20 phiên.
 * @param {Record<string, {date:string, adOpen:number, adClose:number, nmValue:number}[]>} raw
 */
export function stockMatrix(raw, days) {
  const pos = new Map(days.map((d, i) => [d, i])), out = {};
  for (const [t, rows] of Object.entries(raw)) {
    const o = new Float64Array(days.length).fill(NaN), c = new Float64Array(days.length).fill(NaN), v = new Float64Array(days.length).fill(NaN);
    for (const r of rows) { const i = pos.get(r.date); if (i != null && r.adClose > 0) { c[i] = r.adClose; o[i] = r.adOpen > 0 ? r.adOpen : NaN; v[i] = r.nmValue ?? NaN; } }
    const adv = new Float64Array(days.length).fill(NaN);
    for (let i = 19; i < days.length; i++) { let s = 0, ok = true; for (let k = i - 19; k <= i; k++) { if (!Number.isFinite(v[k])) { ok = false; break; } s += v[k]; } if (ok) adv[i] = s / 20; }
    out[t] = { o, c, adv };
  }
  return out;
}

const lr = (a, i, j) => (a[i] > 0 && a[j] > 0 ? Math.log(a[j] / a[i]) : null);

/** Lợi suất ngày ngành dựng = trung bình đều lợi suất log các mã thanh khoản của ngành (≥ 3 mã). */
export function sectorReturns(M, sectorOf, days, cfg = WS_R2) {
  const R = {};
  for (let i = 1; i < days.length; i++) {
    const acc = {};
    for (const [t, x] of Object.entries(M)) {
      const s = sectorOf[t]; if (!s || !(x.adv[i - 1] >= cfg.minAdv)) continue;
      const r = lr(x.c, i - 1, i); if (r == null) continue;
      (acc[s] ??= []).push(r);
    }
    R[days[i]] = Object.fromEntries(Object.entries(acc).filter(([, a]) => a.length >= cfg.minSectorNames).map(([s, a]) => [s, a.reduce((p, q) => p + q, 0) / a.length]));
  }
  return R;
}

const summarizeIc = (rows, L) => {
  const ics = rows.map((r) => r[1]);
  const all = nwMean(ics, L), h = Math.floor(ics.length / 2);
  return { mean: all.mean, t: all.t, p: all.p, n: ics.length, halves: [nwMean(ics.slice(0, h), L).mean, nwMean(ics.slice(h), L).mean], from: rows[0]?.[0] ?? null, to: rows.at(-1)?.[0] ?? null };
};

/**
 * Sửa đổi trước khi chạy (WS-r2-prereg.md): suy luận H5/H6 trên chuỗi KHÔNG chồng lấp — t thông thường trên 10 chuỗi lệch pha
 * (chỉ số ≡ o mod step), lấy trung vị; p một phía = 1 − Φ(t_med).
 */
export function nonOverlapT(ics, step = WS_R2.horizon) {
  const ts = [];
  for (let o = 0; o < step; o++) {
    const x = ics.filter((_, k) => k % step === o); if (x.length < 5) continue;
    const m = x.reduce((a, b) => a + b, 0) / x.length, sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
    if (sd > 0) ts.push(m / (sd / Math.sqrt(x.length)));
  }
  if (!ts.length) return { tMed: null, pNo: 1, offsets: 0 };
  ts.sort((a, b) => a - b);
  const tMed = ts.length % 2 ? ts[(ts.length - 1) / 2] : (ts[ts.length / 2 - 1] + ts[ts.length / 2]) / 2;
  return { tMed, pNo: 1 - normCdf(tMed), offsets: ts.length };
}
const withNo = (res, cfg) => { const no = nonOverlapT(res.series.map((r) => r[1]), cfg.horizon); return { ...res, tNw: res.t, pNw: res.p, t: no.tMed, p: no.pNo, offsets: no.offsets }; };

/** H5: IC ngày giữa ΣS 5 phiên và lợi suất tương đối ngành đóng cửa d → d+10. */
export function testH5({ S, days, R, vn, from, to, cfg = WS_R2 }) {
  const rows = [];
  for (let i = 0; i + cfg.horizon < days.length; i++) {
    const d = days[i]; if (d < from || d > to) continue;
    const xs = [], ys = [];
    for (const s of Object.keys(S[d] ?? {})) {
      const x = wave(S, days, i, s); if (x == null) continue;
      let y = 0, ok = true;
      for (let k = i + 1; k <= i + cfg.horizon; k++) { const r = R[days[k]]?.[s]; if (r == null) { ok = false; break; } y += r; }
      const v = lr(vn, i, i + cfg.horizon);
      if (ok && v != null) { xs.push(x); ys.push(y - v); }
    }
    if (xs.length < cfg.minSectors) continue;
    const ic = spearman(xs, ys); if (ic != null) rows.push([d, ic]);
  }
  return withNo({ ...summarizeIc(rows, cfg.nwLong), series: rows }, cfg);
}

/** Độ dốc OLS của y theo x (cặp hữu hạn). */
export function slope(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0; for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
  return sxx > 0 ? sxy / sxx : null;
}

/** H6: IC ngày giữa b_{i,d}·ΣS và lợi suất mã đóng cửa d → d+10 (trừ trung bình cắt ngang). */
export function testH6({ S, days, M, sectorOf, vn, from, to, cfg = WS_R2 }) {
  const rows = [];
  // Lợi suất tương đối ngày (mã − VN-Index) để ước độ nhạy.
  const relDay = (x, k) => { const a = lr(x.c, k - 1, k), b = lr(vn, k - 1, k); return a == null || b == null ? null : a - b; };
  for (let i = cfg.betaWin; i + cfg.horizon < days.length; i++) {
    const d = days[i]; if (d < from || d > to) continue;
    const xs = [], ys = [];
    for (const [t, x] of Object.entries(M)) {
      const s = sectorOf[t]; if (!s || !(x.adv[i] >= cfg.minAdv)) continue;
      const w = wave(S, days, i, s); if (w == null) continue;
      const fy = lr(x.c, i, i + cfg.horizon); if (fy == null) continue;
      const bx = [], by = [];
      for (let k = i - cfg.betaWin + 1; k <= i; k++) { const sv = S[days[k]]?.[s], r = relDay(x, k); if (sv != null && r != null) { bx.push(sv); by.push(r); } }
      if (bx.length < cfg.betaMin) continue;
      const b = slope(bx, by); if (b == null) continue;
      xs.push(b * w); ys.push(fy);
    }
    if (xs.length < cfg.minStocks) continue;
    const m = ys.reduce((a, q) => a + q, 0) / ys.length;
    const ic = spearman(xs, ys.map((v) => v - m)); if (ic != null) rows.push([d, ic]);
  }
  return withNo({ ...summarizeIc(rows, cfg.nwLong), series: rows }, cfg);
}

/** H7: IC ngày giữa S_{s(i),d} và lợi suất trong phiên ln(close/open) (trừ trung bình cắt ngang); kèm chênh 1/3 trên − 1/3 dưới. */
export function testH7({ S, days, M, sectorOf, from, to, cfg = WS_R2 }) {
  const rows = [], spreads = [];
  for (let i = 1; i < days.length; i++) {
    const d = days[i]; if (d < from || d > to) continue;
    const pts = [];
    for (const [t, x] of Object.entries(M)) {
      const s = sectorOf[t]; if (!s || !(x.adv[i - 1] >= cfg.minAdv)) continue;
      const v = S[d]?.[s]; if (v == null) continue;
      const y = x.o[i] > 0 && x.c[i] > 0 ? Math.log(x.c[i] / x.o[i]) : null; if (y == null) continue;
      pts.push([v, y]);
    }
    if (pts.length < cfg.minStocks) continue;
    const m = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const ic = spearman(pts.map((p) => p[0]), pts.map((p) => p[1] - m));
    if (ic == null) continue;
    rows.push([d, ic]);
    const sorted = [...pts].sort((a, b) => a[0] - b[0]), k = Math.floor(sorted.length / 3);
    if (k >= 5) spreads.push(sorted.slice(-k).reduce((a, p) => a + p[1], 0) / k - sorted.slice(0, k).reduce((a, p) => a + p[1], 0) / k);
  }
  return { ...summarizeIc(rows, cfg.nwShort), series: rows, tercileSpread: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null, spreadDays: spreads.length };
}

/** Holm (bước xuống) cho p một phía; trả p hiệu chỉnh theo thứ tự gốc. */
export function holm(ps) {
  const m = ps.length, order = ps.map((p, i) => [p ?? 1, i]).sort((a, b) => a[0] - b[0]), out = new Array(m);
  let run = 0;
  order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); out[i] = run; });
  return out;
}

/** Kết luận theo prereg. */
export function verdict(results, cfg = WS_R2) {
  const keys = ["H5", "H6", "H7"];
  const adj = holm(keys.map((k) => results[k]?.p ?? 1));
  return Object.fromEntries(keys.map((k, j) => {
    const r = results[k];
    const pass = Boolean(r && r.mean > 0 && adj[j] < cfg.alpha && r.halves?.every((h) => h != null && h > 0));
    return [k, { pass, pHolm: adj[j] }];
  }));
}
