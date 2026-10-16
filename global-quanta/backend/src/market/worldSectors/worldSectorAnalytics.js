// Engine ngành thế giới → ngành Việt Nam (M2) — hàm thuần, có test. Mọi điểm "thuận gió / ngược gió" là THĂM DÒ cho tới khi
// qua kiểm định đặt trước (M3).
//
// Chuẩn hoá: biến động h phiên của mã i -> z = r_h / (σ_i · √h), σ_i = độ lệch chuẩn log-lợi suất ngày 250 phiên gần nhất.
// Gộp: trong khu vực = trung bình có trọng số mức khớp (exact 1 / close 0,75 / partial 0,4); giữa khu vực = trung bình đều các
// khu vực có dữ liệu (để Mỹ — nhiều ETF — không lấn át châu Âu/châu Á).
// Ngắn hạn = THÔNG TIN MỚI kể từ khi phiên VN gần nhất đóng cửa:
//   sàn "prev" (Mỹ/Âu/ETF TQ niêm yết Mỹ): các phiên có ngày >= ngày phiên VN gần nhất (đóng cửa sau giờ VN);
//   sàn "same" (Nhật/Hàn/Đài/HK): các phiên có ngày > ngày phiên VN gần nhất (phiên cùng ngày đã diễn ra trong giờ VN).
import { MATCH_WEIGHT } from "./catalog.js";

export const SHORT_THRESHOLD = 0.5; // |điểm| ≥ 0,5 độ lệch chuẩn -> thuận/ngược gió
export const VOL_WINDOW = 250;
export const Z_CAP = 3; // chặn |z| khi gộp: mã thanh khoản thấp (nhiều phiên đứng giá) có σ rất nhỏ -> z phóng đại
const clampZ = (z) => Math.max(-Z_CAP, Math.min(Z_CAP, z));
const ROUND = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export function logReturns(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) if (points[i - 1][1] > 0 && points[i][1] > 0) out.push([points[i][0], Math.log(points[i][1] / points[i - 1][1])]);
  return out;
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function std(a) { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  const mx = mean(x), my = mean(y);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null;
}

/** σ ngày (log) của 250 phiên gần nhất. */
export function dailyVol(points) { const r = logReturns(points).slice(-VOL_WINDOW).map((x) => x[1]); return r.length >= 20 ? std(r) : null; }

/** z của biến động h phiên gần nhất. */
export function zMove(points, h) {
  const s = dailyVol(points);
  if (!s || points.length <= h) return null;
  const r = Math.log(points.at(-1)[1] / points.at(-1 - h)[1]);
  return { z: ROUND(r / (s * Math.sqrt(h)), 3), pct: ROUND((Math.exp(r) - 1) * 100, 3) };
}

/** Biến động MỚI sau phiên VN gần nhất (vnLast): log-lợi suất cộng dồn các phiên mới, z theo √(số phiên). */
export function newSinceVnClose(points, session, vnLast) {
  if (!vnLast || points.length < 2) return null;
  const isNew = (d) => (session === "same" ? d > vnLast : d >= vnLast);
  const lr = logReturns(points).filter(([d]) => isNew(d));
  if (!lr.length) return { sessions: [], z: null, pct: null }; // chưa có phiên mới -> không tính (không phải 0)
  const s = dailyVol(points);
  const r = lr.reduce((a, x) => a + x[1], 0);
  return { sessions: lr.map((x) => x[0]), z: s ? ROUND(r / (s * Math.sqrt(lr.length)), 3) : null, pct: ROUND((Math.exp(r) - 1) * 100, 3) };
}

/**
 * Gộp các z của mã theo khu vực rồi giữa khu vực. items: [{ region, match, z }] -> { score, byRegion: { R: { z, n } } }.
 */
export function aggregate(items) {
  const by = {};
  for (const it of items) {
    if (it.z == null || !Number.isFinite(it.z)) continue;
    const w = MATCH_WEIGHT[it.match] ?? 0;
    (by[it.region] ??= { sw: 0, swz: 0, n: 0 });
    by[it.region].sw += w; by[it.region].swz += w * clampZ(it.z); by[it.region].n++;
  }
  const regions = Object.entries(by).filter(([, v]) => v.sw > 0).map(([r, v]) => [r, { z: ROUND(v.swz / v.sw, 3), n: v.n }]);
  return { score: regions.length ? ROUND(mean(regions.map(([, v]) => v.z)), 3) : null, byRegion: Object.fromEntries(regions) };
}

export const labelOf = (score, thr = SHORT_THRESHOLD) => (score == null ? "na" : score >= thr ? "tailwind" : score <= -thr ? "headwind" : "neutral");

/**
 * Cặp lợi suất (VN, nước ngoài) theo phiên VN. predictive=true: nước ngoài lấy phiên TRƯỚC ngày VN (mọi sàn) — dùng cho dự báo;
 * false: sàn "same" lấy cùng ngày (đồng thời, mô tả), sàn "prev" vẫn lấy phiên trước.
 */
export function alignPairs(vnPts, fPts, session, predictive = true) {
  const fr = logReturns(fPts), vr = logReturns(vnPts);
  const dates = fr.map((x) => x[0]);
  const at = (d, strict) => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (strict ? dates[m] < d : dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans < 0 ? null : fr[ans];
  };
  const strict = predictive || session !== "same";
  const out = [];
  for (const [d, y] of vr) {
    const x = at(d, strict);
    if (!x) continue;
    if (!strict && x[0] !== d) continue; // đồng thời: phải cùng ngày
    out.push([d, x[1], y]);
  }
  return out;
}

/** Quan hệ: tương quan + beta (250 phiên), ngưỡng ~95%, tương quan cuộn 60, trễ 0..5 (nước ngoài dẫn). */
export function relation(vnPts, fPts, session) {
  const pairs = alignPairs(vnPts, fPts, session, true);
  if (pairs.length < 30) return null;
  const win = pairs.slice(-VOL_WINDOW);
  const xs = win.map((p) => p[1]), ys = win.map((p) => p[2]);
  const corr = pearson(xs, ys);
  const vx = std(xs) ** 2, mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.length - 1);
  const rolling = [];
  for (let i = 60; i <= pairs.length; i += 1) { const w = pairs.slice(i - 60, i); rolling.push([w.at(-1)[0], ROUND(pearson(w.map((p) => p[1]), w.map((p) => p[2])), 3)]); }
  const leadLag = [];
  for (let k = 0; k <= 5; k++) leadLag.push({ lag: k, r: ROUND(pearson(xs.slice(0, xs.length - k), ys.slice(k)), 3), n: xs.length - k });
  let contemporaneous = null;
  if (session === "same") { const c = alignPairs(vnPts, fPts, session, false).slice(-VOL_WINDOW); contemporaneous = ROUND(pearson(c.map((p) => p[1]), c.map((p) => p[2])), 3); }
  const band = 1.96 / Math.sqrt(win.length);
  return { n: win.length, corr: ROUND(corr, 3), beta: vx > 0 ? ROUND(cov / vx, 3) : null, band: ROUND(band, 3), significant: corr != null && Math.abs(corr) > band, contemporaneous, leadLag, rolling: rolling.slice(-750), exploratory: true };
}

/**
 * Điểm cho một ngành VN. inst: [{ symbol, region, match, session, points }], vnPts: chỉ số ICB, commodities: [{ id, sign, points, freq }].
 * Trả { short, medium, commodity, label, components }.
 */
export function sectorScores(vnPts, inst, commodities = []) {
  const vnLast = vnPts.at(-1)?.[0] ?? null;
  const comp = inst.map((i) => {
    const nw = newSinceVnClose(i.points, i.session, vnLast);
    const m1 = zMove(i.points, 21), m3 = zMove(i.points, 63), w1 = zMove(i.points, 5);
    return { symbol: i.symbol, region: i.region, match: i.match, session: i.session, lastDate: i.points.at(-1)?.[0] ?? null, new: nw, w1, m1, m3 };
  });
  const short = aggregate(comp.map((c) => ({ region: c.region, match: c.match, z: c.new?.z })));
  const week = aggregate(comp.map((c) => ({ region: c.region, match: c.match, z: c.w1?.z })));
  const m1 = aggregate(comp.map((c) => ({ region: c.region, match: c.match, z: c.m1?.z })));
  const m3 = aggregate(comp.map((c) => ({ region: c.region, match: c.match, z: c.m3?.z })));
  const vn = { w1: zMove(vnPts, 5), m1: zMove(vnPts, 21), m3: zMove(vnPts, 63) };
  const cm = commodities.map((c) => {
    // hàng hoá THÁNG (Pink Sheet) không có thông tin mới theo phiên -> chỉ vào trung hạn
    const s = c.freq === "month" ? null : newSinceVnClose(c.points, "prev", vnLast);
    const mm = c.freq === "month" ? zMove(c.points, 3) : zMove(c.points, 63);
    return { id: c.id, nameVi: c.nameVi, sign: c.sign, freq: c.freq, short: s && { ...s, z: s.z == null ? null : ROUND(s.z * c.sign, 3) }, medium: mm && { ...mm, z: mm.z == null ? null : ROUND(mm.z * c.sign, 3) } };
  });
  const cShort = cm.map((c) => c.short?.z).filter((z) => z != null).map(clampZ), cMed = cm.map((c) => c.medium?.z).filter((z) => z != null).map(clampZ);
  const cs = cShort.length ? ROUND(mean(cShort), 3) : null, cmd = cMed.length ? ROUND(mean(cMed), 3) : null;
  // tổng hợp: ngành thế giới 70% + hàng hoá 30% khi có hàng hoá
  const blend = (a, b) => (a == null ? b : b == null ? a : ROUND(0.7 * a + 0.3 * b, 3));
  const shortScore = blend(short.score, cs);
  const mediumScore = blend(m3.score, cmd);
  return {
    vnLast,
    short: { score: shortScore, sectors: short, commodity: cs, label: labelOf(shortScore), week },
    medium: { score: mediumScore, sectors: m3, m1, commodity: cmd, label: labelOf(mediumScore), vn, gap3m: m3.score != null && vn.m3?.z != null ? ROUND(m3.score - vn.m3.z, 3) : null },
    components: comp, commodities: cm,
  };
}

/** Quy về 100 tại `from`. */
export function rebase(points, from) {
  const p = points.filter(([d]) => d >= from);
  const b = p[0]?.[1];
  return b > 0 ? p.map(([d, v]) => [d, ROUND((v / b) * 100, 3)]) : [];
}
