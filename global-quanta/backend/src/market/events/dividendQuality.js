// BL2 (07/11/2026) — DQ-v1: lợi suất chuẩn hoá, độ bền cổ tức, mô hình Lintner, rủi ro giá. MÔ TẢ (chưa kiểm định dự báo — BL3 sẽ đăng ký trước).
// Nguồn: BCTC năm VNDirect (LNST công ty mẹ, dòng tiền HĐKD, capex, CỔ TỨC ĐÃ TRẢ — mã 33600, gồm cả phần trả cổ đông thiểu số; ~20 năm),
//        cổ tức / cp theo năm tài chính (kho sự kiện, từ 2022), giá điều chỉnh (px store, từ 2020) + VN-Index.
// Ngân hàng / chứng khoán / bảo hiểm: dòng tiền & nợ không so được với doanh nghiệp thường -> bỏ các tiêu chí dòng tiền / nợ.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { pitFeatures } from "./factorModel.js";

export const DQ_VERSION = "DQ-v1 (2026-11-07)";
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };

/** Chuỗi năm từ BCTC năm: D = cổ tức đã trả (dương), E = LNST công ty mẹ. Năm hiện hành (chưa hết năm) bị bỏ. */
export function annualSeries(annual, thisYear) {
  return (annual ?? []).filter((a) => a.year < thisYear).map((a) => ({ year: a.year, E: fin(a.v?.npatParent) ? a.v.npatParent : null, D: fin(a.v?.divPaid) ? Math.abs(a.v.divPaid) : null, cfo: fin(a.v?.cfo) ? a.v.cfo : null, capex: fin(a.v?.capex) ? -Math.abs(a.v.capex) : null }))
    .sort((a, b) => a.year - b.year);
}

/** OLS nhiều biến (phương trình chuẩn, 3 biến). Trả hệ số + R². */
function ols3(rows) {
  // y = a + b1 x1 + b2 x2
  const n = rows.length; if (n < 5) return null;
  const S = (f) => rows.reduce((s, r) => s + f(r), 0);
  const M = [[n, S((r) => r.x1), S((r) => r.x2)], [S((r) => r.x1), S((r) => r.x1 * r.x1), S((r) => r.x1 * r.x2)], [S((r) => r.x2), S((r) => r.x1 * r.x2), S((r) => r.x2 * r.x2)]];
  const v = [S((r) => r.y), S((r) => r.x1 * r.y), S((r) => r.x2 * r.y)];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (!fin(D) || Math.abs(D) < 1e-12 * Math.abs(M[1][1] * M[2][2] || 1)) return null;
  const col = (k) => M.map((row, i) => row.map((x, j) => (j === k ? v[i] : x)));
  const [a, b1, b2] = [0, 1, 2].map((k) => det(col(k)) / D);
  const ym = mean(rows.map((r) => r.y));
  const ssr = rows.reduce((s, r) => s + (r.y - (a + b1 * r.x1 + b2 * r.x2)) ** 2, 0), sst = rows.reduce((s, r) => s + (r.y - ym) ** 2, 0);
  return { a, b1, b2, r2: sst > 0 ? 1 - ssr / sst : null, n };
}

/**
 * Lintner (1956): ΔD_t = a + b1·E_t + b2·D_{t−1}. Tốc độ điều chỉnh c = −b2, tỷ lệ chi trả mục tiêu r = b1 / c.
 * Cần ≥ 8 năm có D, E và D năm trước; kết quả chỉ nhận khi 0 < c ≤ 1,5 và 0 ≤ r ≤ 1,5 (ngoài khoảng = mô hình không mô tả được mã này).
 */
export function lintner(series) {
  const rows = [];
  for (let i = 1; i < series.length; i++) { const p = series[i - 1], c = series[i]; if (fin(c.D) && fin(p.D) && fin(c.E) && c.year === p.year + 1) rows.push({ y: c.D - p.D, x1: c.E, x2: p.D, year: c.year }); }
  if (rows.length < 8) return { ok: false, n: rows.length, reason: "chưa đủ 8 năm" };
  const scale = mean(rows.map((r) => Math.abs(r.x1))) || 1; // chuẩn hoá quy mô để ổn định số học
  const f = ols3(rows.map((r) => ({ y: r.y / scale, x1: r.x1 / scale, x2: r.x2 / scale })));
  if (!f) return { ok: false, n: rows.length, reason: "suy biến" };
  const c = -f.b2, tp = c > 0 ? f.b1 / c : null;
  const ok = c > 0 && c <= 1.5 && fin(tp) && tp >= 0 && tp <= 1.5;
  return { ok, n: rows.length, from: rows[0].year, to: rows.at(-1).year, speed: r4(c), targetPayout: r4(tp), r2: r4(f.r2), reason: ok ? null : "hệ số ngoài khoảng kinh tế (công ty không làm mượt cổ tức theo Lintner)" };
}

/** Độ bền ở cấp công ty từ chuỗi năm. */
export function companyDividendStats(series) {
  const last5 = series.slice(-5), last10 = series.slice(-10);
  const sumE = last5.reduce((s, r) => s + (fin(r.E) ? r.E : 0), 0), sumD = last5.reduce((s, r) => s + (fin(r.D) ? r.D : 0), 0);
  const fcf5 = last5.every((r) => fin(r.cfo)) ? last5.reduce((s, r) => s + r.cfo + (fin(r.capex) ? r.capex : 0), 0) : null;
  let streak = 0; for (let i = series.length - 1; i >= 0 && series[i].D > 0; i--) streak += 1;
  let cuts10 = 0; for (let i = Math.max(1, series.length - 10); i < series.length; i++) { const a = series[i].D, b = series[i - 1].D; if (fin(a) && fin(b) && b > 0 && a < 0.9 * b) cuts10 += 1; }
  const ds = last5.map((r) => r.D).filter((x) => fin(x) && x > 0);
  const negE = last10.filter((r) => fin(r.E) && r.E < 0).length;
  return { years: series.length, payout5: sumE > 0 ? r4(sumD / sumE) : null, fcfCover5: fin(fcf5) && sumD > 0 ? r4(fcf5 / sumD) : null, streak, cuts10,
    divCv5: ds.length >= 3 ? r4(sd(ds) / mean(ds)) : null, lossYears10: negE, lastYear: series.at(-1)?.year ?? null, lastD: series.at(-1)?.D ?? null, lastE: series.at(-1)?.E ?? null };
}

/** Rủi ro giá từ giá điều chỉnh (≥ 200 phiên): biến động năm hoá, sụt giảm lớn nhất 1 năm, lợi nhuận 1 năm, beta so VN-Index. */
export function priceRisk(rows, vnMap) {
  const s = (rows ?? []).filter((r) => r[1] > 0).slice(-252);
  if (s.length < 200) return null;
  const rets = [], mk = [];
  for (let i = 1; i < s.length; i++) {
    const r = Math.log(s[i][1] / s[i - 1][1]); rets.push(r);
    const a = vnMap.get(s[i][0]), b = vnMap.get(s[i - 1][0]); if (a > 0 && b > 0) mk.push([r, Math.log(a / b)]);
  }
  let peak = -Infinity, mdd = 0; for (const r of s) { peak = Math.max(peak, r[1]); mdd = Math.min(mdd, r[1] / peak - 1); }
  let beta = null; if (mk.length >= 150) { const mx = mean(mk.map((x) => x[1])), my = mean(mk.map((x) => x[0])); const cov = mk.reduce((t, x) => t + (x[1] - mx) * (x[0] - my), 0), vr = mk.reduce((t, x) => t + (x[1] - mx) ** 2, 0); beta = vr > 0 ? cov / vr : null; }
  return { vol1y: r4(sd(rets) * Math.sqrt(252)), mdd1y: r4(mdd), ret1y: r4(s.at(-1)[1] / s[0][1] - 1), beta: r4(beta), sessions: s.length };
}

/**
 * Hồ sơ DQ-v1 của một mã. price: đồng; mcap: đồng; fy: { lastFy, lastFyCash, history: [[năm, đ/cp]] } (sự kiện); ttmCash: đ/cp 12 tháng.
 * financial: true cho ngân hàng / CK / BH (bỏ tiêu chí dòng tiền và nợ).
 */
export function dividendQuality({ series, price, mcap, ttmCash, fy, kq, risk, financial }) {
  const comp = companyDividendStats(series);
  const lt = lintner(series);
  const hist = (fy?.history ?? []).filter(([y]) => fy?.lastFy == null || y <= fy.lastFy).slice(-3).map(([, c]) => c);
  const fyYield = price > 0 && fy?.lastFyCash > 0 ? fy.lastFyCash / price : null;
  const med3 = price > 0 && hist.length ? median(hist) / price : null;
  const ttmYield = price > 0 && ttmCash > 0 ? ttmCash / price : null;
  const catchUp = fin(ttmYield) && fin(fyYield) && fyYield > 0 && ttmYield > 1.25 * fyYield;
  const companyYield = mcap > 0 && comp.lastD > 0 ? comp.lastD / mcap : null;
  // Kỳ vọng mô hình Lintner cho năm tới (mô tả): D̂ = D + c·(r·Ê − D), Ê = ước LNST cả năm (KQKD nowcast) hoặc LNST năm gần nhất.
  const eHat = fin(kq?.nowcastEst) ? kq.nowcastEst : comp.lastE;
  const lintnerNext = lt.ok && fin(comp.lastD) && fin(eHat) ? Math.max(0, comp.lastD + lt.speed * (lt.targetPayout * eHat - comp.lastD)) : null;
  const checks = [
    { id: "payout", label: "Chi trả 5 năm ≤ 80% lợi nhuận", pass: fin(comp.payout5) ? comp.payout5 <= 0.8 : null },
    { id: "fcf", label: "Dòng tiền tự do 5 năm ≥ cổ tức đã trả", pass: financial ? null : fin(comp.fcfCover5) ? comp.fcfCover5 >= 1 : null },
    { id: "cfo", label: "Dòng tiền HĐKD / LNST (4 quý) ≥ 0,8", pass: financial ? null : fin(kq?.cfoToNpat) ? kq.cfoToNpat >= 0.8 : null },
    { id: "debt", label: "Nợ ròng / EBITDA ≤ 2,5", pass: financial ? null : fin(kq?.netDebtEbitda) ? kq.netDebtEbitda <= 2.5 : null },
    { id: "cuts", label: "Không cắt cổ tức > 10% trong 5 năm", pass: series.length >= 6 ? series.slice(-6).every((r, i, a) => i === 0 || !(a[i - 1].D > 0) || (fin(r.D) && r.D >= 0.9 * a[i - 1].D)) : null },
    { id: "streak", label: "Chi cổ tức tiền ≥ 5 năm liên tục", pass: series.length >= 5 ? comp.streak >= 5 : null },
    { id: "growth", label: "LNST 12 tháng không giảm", pass: fin(kq?.growthTtm) ? kq.growthTtm >= 0 : null },
  ];
  const known = checks.filter((c) => c.pass != null);
  const reasons = [];
  const hy = fin(fyYield) ? fyYield : ttmYield;
  if (fin(hy) && hy >= 0.08) {
    if (fin(risk?.ret1y) && risk.ret1y <= -0.3) reasons.push(`giá giảm ${Math.round(-risk.ret1y * 100)}% trong 1 năm`);
    if (fin(comp.payout5) && comp.payout5 > 1) reasons.push("chi trả 5 năm vượt lợi nhuận");
    if (!financial && fin(comp.fcfCover5) && comp.fcfCover5 < 0.5) reasons.push("dòng tiền tự do phủ < 50% cổ tức");
    if (fin(kq?.growthTtm) && kq.growthTtm <= -0.3) reasons.push("LNST 12 tháng giảm > 30%");
  }
  return { version: DQ_VERSION,
    yield: { fy: r4(fyYield), fyYear: fy?.lastFy ?? null, median3: r4(med3), ttm: r4(ttmYield), catchUp, company: r4(companyYield) },
    company: comp, lintner: lt, lintnerNextD: fin(lintnerNext) ? Math.round(lintnerNext) : null, lintnerNextYield: fin(lintnerNext) && mcap > 0 ? r4(lintnerNext / mcap) : null,
    checks, checksPassed: known.filter((c) => c.pass).length, checksKnown: known.length, risk: risk ?? null, trap: reasons.length ? reasons : null };
}

// ---- Dịch vụ: tính sẵn phần không phụ thuộc giá trực tiếp (chuỗi năm BCTC + rủi ro giá) mỗi tối, lưu <dir>/dq-base.json.gz ----
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };

export function createDividendQualityBase({ dir, now = Date.now, log = console, getSharesEps = null, getEventsOf = null }) {
  const file = path.join(dir, "dq-base.json.gz");
  let memo = null, running = false;
  async function run() {
    if (running) return { running: true };
    running = true; const t0 = now();
    try {
      const today = new Date(now() + 7 * 3_600_000).toISOString().slice(0, 10), thisYear = Number(today.slice(0, 4));
      const vn = new Map((readGz(path.join(dir, "px", "VNINDEX.json.gz"))?.rows ?? []).map((r) => [r[0], r[1]]));
      const byTicker = {};
      for (const f of fs.readdirSync(dir).filter((x) => /^[A-Z0-9]{3,10}\.json\.gz$/.test(x))) {
        const t = f.slice(0, -8), rec = readGz(path.join(dir, f)); if (!rec) continue;
        const series = annualSeries(rec.annual, thisYear).slice(-20);
        const pxRows = readGz(path.join(dir, "px", f))?.rows ?? [];
        const risk = priceRisk(pxRows, vn);
        // BL3: biến FM-v1 tại hôm nay (cùng hàm với kiểm định BL-r1). px store: [ngày, adClose, nmValue, close] -> [ngày, adClose, close].
        // EPS-v1: số cổ phiếu lưu hành theo kỳ (VNDirect) cho vốn hoá đúng thời điểm (thay suy ngược LNST / EPS — sai với ngân hàng).
        const sh = getSharesEps?.()?.(t)?.shares ?? null;
        const fm = pitFeatures(sh?.length ? { ...rec, sharesHist: sh, events: getEventsOf?.(t) ?? [] } : rec, pxRows.map((r) => [r[0], r[1], r[3] ?? null]), today);
        byTicker[t] = { tpl: rec.tpl ?? null, series, risk, fm };
      }
      memo = { version: DQ_VERSION, builtAt: new Date(now()).toISOString(), tickers: Object.keys(byTicker).length, byTicker, ms: now() - t0 };
      writeGz(file, memo);
      log.log?.(`[dq] ${memo.tickers} mã, ${(memo.ms / 1000).toFixed(1)} s.`);
      return { tickers: memo.tickers, ms: memo.ms };
    } finally { running = false; }
  }
  return { run, doc: () => (memo ??= readGz(file)), hasData: () => fs.existsSync(file) };
}
