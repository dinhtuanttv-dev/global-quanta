// LC3 (06/11/2026) — PHẢN ỨNG GIÁ QUANH NGÀY CÔNG BỐ KQKD (nghiên cứu sự kiện chuẩn). Hàm thuần, không I/O. Nhãn MÔ TẢ.
//   Ngày sự kiện = ngày công bố thật (earningsCalendar.publishDates: tin BCTC chính thức VNDirect, hoặc ngày dữ liệu — có thể trễ vài ngày,
//   nên thống kê chính dùng sự kiện có tin BCTC chính thức; nhóm "ngày dữ liệu" báo riêng). Phiên 0 = phiên giao dịch đầu tiên ≥ ngày công bố.
//   Lợi suất bất thường — mô hình thị trường (MacKinlay 1997): r_t = α + β·r_m,t (log, giá điều chỉnh VNDirect adClose; thị trường = VN-Index),
//   OLS trên cửa sổ ước lượng [−130, −11] (cần ≥ 60 phiên). AR_t = r_t − α − β·r_m,t; CAR[a,b] = Σ AR; SCAR = CAR / (σ_ε √(b−a+1)).
//   Khối lượng bất thường — Campbell & Wasley (1996): v = ln(1 + GTGD khớp lệnh), v_t = a + b·m_t với m = ln(1 + GTGD khớp lệnh toàn HOSE),
//   σ_v = 1,4826·MAD phần dư; z_[a,b] = Σ AV / (σ_v √(b−a+1)).
//   Cửa sổ (chốt trước): trước tin [−10, −1] (rò rỉ / giá chạy trước), phản ứng [0, +2], trôi sau tin [+3, +60] (PEAD; Bernard & Thomas 1989).
//   Nhóm theo SUE LN cốt lõi (ngũ phân vị trong từng quý) -> đường CAR trung bình −10…+60, khoảng tin cậy bootstrap.
import { prepareQuarters } from "./kqkdEngine.js";
import { standardizedSurprise } from "./earningsQuality.js";

export const ES_VERSION = "ES-v1 (2026-11-06)";
export const ES = Object.freeze({ estFrom: -130, estTo: -11, minEst: 60, pre: [-10, -1], ann: [0, 2], post: [3, 60], z: 2, boot: 1000, seed: 20261106 });
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
function ols(xs, ys) {
  const n = xs.length, mx = mean(xs), my = mean(ys); let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  return { a, b, resid: ys.map((y, i) => y - a - b * xs[i]) };
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Khoảng tin cậy 95% bootstrap (iid theo sự kiện) của trung bình. */
export function bootCi(xs, { iters = ES.boot, seed = ES.seed } = {}) {
  const a = xs.filter(fin); if (a.length < 10) return { n: a.length, mean: r4(mean(a)), lo: null, hi: null };
  const rand = rng(seed), ms = [];
  for (let b = 0; b < iters; b++) { let s = 0; for (let i = 0; i < a.length; i++) s += a[Math.floor(rand() * a.length)]; ms.push(s / a.length); }
  ms.sort((x, y) => x - y);
  return { n: a.length, mean: r4(mean(a)), lo: r4(ms[Math.floor(iters * 0.025)]), hi: r4(ms[Math.floor(iters * 0.975)]) };
}

/** Chuỗi giá [[date, adClose, nmValue]] -> { dates, close, val, idx(date) phiên đầu tiên ≥ date }. */
export function series(rows) {
  const s = [...(rows ?? [])].filter((r) => r[1] > 0).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const dates = s.map((r) => r[0]), close = s.map((r) => r[1]), val = s.map((r) => r[2] ?? 0);
  const idx = (d) => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < d) lo = m + 1; else hi = m; } return lo; };
  return { dates, close, val, idx };
}

/** Phản ứng của một sự kiện. px: series mã; mkt: Map date -> { close, val }. */
export function eventReaction(px, mkt, date, p = ES) {
  const e0 = px.idx(date);
  if (e0 >= px.dates.length) return null;
  if (e0 + p.estFrom < 1) return { e0: px.dates[e0], insufficient: true, nEst: Math.max(0, e0 + p.estTo) };
  const pt = (i) => { if (i < 1 || i >= px.dates.length) return null; const m = mkt.get(px.dates[i]), mp = mkt.get(px.dates[i - 1]); if (!m || !mp || !(m.close > 0) || !(mp.close > 0)) return null; return { r: Math.log(px.close[i] / px.close[i - 1]), rm: Math.log(m.close / mp.close), v: Math.log1p(px.val[i] ?? 0), mv: Math.log1p(m.val ?? 0) }; };
  const est = [];
  for (let i = e0 + p.estFrom; i <= e0 + p.estTo; i++) { const x = pt(i); if (x && px.val[i] > 0 && x.mv > 0) est.push(x); }
  if (est.length < p.minEst) return { e0: px.dates[e0], insufficient: true, nEst: est.length };
  const rm = ols(est.map((x) => x.rm), est.map((x) => x.r));
  const se = Math.sqrt(rm.resid.reduce((s, x) => s + x * x, 0) / Math.max(1, est.length - 2));
  const vm = ols(est.map((x) => x.mv), est.map((x) => x.v));
  const md = median(vm.resid), sv = 1.4826 * median(vm.resid.map((x) => Math.abs(x - md))) || 1e-9;
  const ar = (k) => { const x = pt(e0 + k); return x ? x.r - rm.a - rm.b * x.rm : null; };
  const av = (k) => { const x = pt(e0 + k); return x && px.val[e0 + k] > 0 ? x.v - vm.a - vm.b * x.mv : null; };
  const win = (f, [a, b]) => { let s = 0, n = 0; for (let k = a; k <= b; k++) { const v = f(k); if (v == null) return null; s += v; n += 1; } return { s, n }; };
  const car = (w) => { const x = win(ar, w); return x ? { car: x.s, scar: x.s / (se * Math.sqrt(x.n)) } : null; };
  const zv = (w) => { const x = win(av, w); return x ? x.s / (sv * Math.sqrt(x.n)) : null; };
  const pre = car(p.pre), ann = car(p.ann), post = car(p.post);
  const path = []; let c = 0;
  for (let k = p.pre[0]; k <= p.post[1]; k++) { const v = ar(k); if (v == null) break; c += v; path.push(r4(c)); }
  return { e0: px.dates[e0], beta: r4(rm.b), sigma: r4(se), carPre: r4(pre?.car), scarPre: r4(pre?.scar), carAnn: r4(ann?.car), scarAnn: r4(ann?.scar), carPost: r4(post?.car), scarPost: r4(post?.scar),
    avPre: r4(zv(p.pre)), avAnn: r4(zv(p.ann)), path, sessionsAfter: Math.max(0, px.dates.length - 1 - e0) };
}

/** SUE (LN cốt lõi, LNST mẹ) point-in-time tại ngày công bố. */
export function sueAt(rec, fiscal, date) {
  const by = prepareQuarters(rec.tpl ?? "corp", (rec.quarters ?? []).map((q) => (q.fiscal === fiscal ? { ...q, created: date } : q)), date);
  const key = (k) => new Map([...by.values()].map((x) => [`${Math.floor(x.n / 4)}-${(x.n % 4) + 1}`, x.d[k]]));
  return { core: standardizedSurprise(key("core"), fiscal), npat: standardizedSurprise(key("npatParent"), fiscal) };
}

/**
 * S4 — bằng chứng GỘP (tham chiếu) theo nhóm mã × loại quý: chỉ sự kiện có ngày chính xác (tin BCTC chính thức).
 * compact: [{ t, q (loại quý 1–4), s (1 = ngày chính xác), sue, pre, ann, post }]. Trả theo quý: số lần, 3 cửa sổ (CI 95%), chênh 1/3 SUE cao − thấp.
 */
export function pooledEvidence(compact, members) {
  const out = {};
  for (const q of [1, 2, 3, 4]) {
    const es = compact.filter((e) => e.q === q && e.s === 1 && members.has(e.t));
    const sues = es.filter((e) => fin(e.sue)).sort((a, b) => a.sue - b.sue), k = Math.floor(sues.length / 3);
    const hi = k >= 5 ? mean(sues.slice(-k).map((e) => e.ann).filter(fin)) : null, lo = k >= 5 ? mean(sues.slice(0, k).map((e) => e.ann).filter(fin)) : null;
    out[q] = { n: es.length, tickers: new Set(es.map((e) => e.t)).size, pre: bootCi(es.map((e) => e.pre)), ann: bootCi(es.map((e) => e.ann)), post: bootCi(es.map((e) => e.post)),
      sueSplit: fin(hi) && fin(lo) ? { high: r4(hi), low: r4(lo), diff: r4(hi - lo), k } : null };
  }
  return out;
}

/**
 * Tổng hợp. events: [{ t, fiscal, date, source, sue, r: eventReaction }]. Trả nhóm ngũ phân vị SUE (theo quý), đường CAR, rò rỉ, theo nguồn ngày.
 */
export function aggregate(events) {
  const ok = events.filter((e) => e.r && !e.r.insufficient);
  // Ngũ phân vị SUE trong từng quý (so ngang cùng mùa).
  const byQ = new Map();
  for (const e of ok) if (fin(e.sue)) (byQ.get(e.fiscal) ?? byQ.set(e.fiscal, []).get(e.fiscal)).push(e);
  for (const es of byQ.values()) { if (es.length < 25) continue; es.sort((a, b) => a.sue - b.sue); es.forEach((e, i) => { e.quint = Math.min(5, Math.floor((i / es.length) * 5) + 1); }); }
  const groupStats = (es) => {
    const len = ES.post[1] - ES.pre[0] + 1, paths = es.map((e) => e.r.path).filter((p) => p.length === len);
    return { n: es.length, pre: bootCi(es.map((e) => e.r.carPre)), ann: bootCi(es.map((e) => e.r.carAnn)), post: bootCi(es.map((e) => e.r.carPost)),
      path: paths.length >= 10 ? Array.from({ length: len }, (_, k) => r4(mean(paths.map((p) => p[k])))) : null, nPath: paths.length,
      leakPrice: r4(es.filter((e) => fin(e.r.scarPre) && Math.abs(e.r.scarPre) >= ES.z).length / Math.max(1, es.filter((e) => fin(e.r.scarPre)).length)),
      leakVolume: r4(es.filter((e) => fin(e.r.avPre) && e.r.avPre >= ES.z).length / Math.max(1, es.filter((e) => fin(e.r.avPre)).length)),
      reactVolume: r4(es.filter((e) => fin(e.r.avAnn) && e.r.avAnn >= ES.z).length / Math.max(1, es.filter((e) => fin(e.r.avAnn)).length)) };
  };
  const precise = ok.filter((e) => e.source === "DISCLOSURE");
  const quint = {}; for (let q = 1; q <= 5; q++) quint[q] = groupStats(precise.filter((e) => e.quint === q));
  const spread = (k) => { const a = quint[5][k].mean, b = quint[1][k].mean; return fin(a) && fin(b) ? r4(a - b) : null; };
  return {
    version: ES_VERSION, label: "MÔ TẢ", windows: { pre: ES.pre, ann: ES.ann, post: ES.post, est: [ES.estFrom, ES.estTo] }, pathFrom: ES.pre[0],
    events: ok.length, precise: precise.length, quarters: [...new Set(ok.map((e) => e.fiscal))].sort(),
    all: groupStats(precise), dataDated: groupStats(ok.filter((e) => e.source !== "DISCLOSURE")), quintiles: quint,
    spread: { pre: spread("pre"), ann: spread("ann"), post: spread("post") },
    baseRate: 0.0228, // P(z ≥ 2) một phía dưới chuẩn — mức "rò rỉ" ngẫu nhiên kỳ vọng cho khối lượng; giá hai phía ≈ 4,6%
    method: "Mô hình thị trường (VN-Index), ước lượng [−130, −11]; CAR [−10, −1] / [0, +2] / [+3, +60]; khối lượng bất thường Campbell–Wasley (log GTGD so toàn HOSE). Nhóm theo SUE LN cốt lõi trong từng quý. Thống kê chính chỉ dùng sự kiện có tin BCTC chính thức (ngày chính xác). MÔ TẢ — chưa kiểm định đặt trước làm tín hiệu.",
  };
}
