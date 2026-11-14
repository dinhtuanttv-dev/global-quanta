// PZ-v2 (14/11/2026) — VỊ TRÍ GIÁ cho Elite HL: mã đạt chuẩn Hợp lưu đang ở đâu so với nền giá, và lúc nào được mua.
// Đặc tả: "Vòng đời vị trí giá và bảng Theo dõi chờ nền — Elite HL" (bản giám đốc dự án, 14/11/2026). Hàm THUẦN, có test.
//
//   HL quyết định mã nào ĐẠT CHUẨN; PZ quyết định mã nằm ở NGĂN nào:
//     • Danh mục chính (CORE)   — đang giữ, trong nền hoặc vùng mua (và mã mua mới).
//     • Chạy lãi (RUNNER)       — đang giữ nhưng đã tăng nóng / hạ nhiệt / dựng nền mới: GIỮ vị thế, không mua thêm, vẫn chiếm ô.
//     • Chờ nền (WAIT)          — chưa giữ, đã tăng nóng: không mua cho tới khi dựng xong nền mới và về vùng mua.
//
//   Nguyên tắc: (1) rời bảng chính KHÔNG phải lệnh bán; (2) mọi số tính trên dữ liệu ≤ phiên D (không nhìn trước);
//   (3) giá, nền và chỉ số phải CÙNG phiên — lệch phiên thì "Chưa xác định", không kết luận; (4) ngưỡng ghi "khởi điểm" là đề xuất,
//   chưa kiểm định trên dữ liệu Việt Nam — giai đoạn hiện tại CHỈ HIỂN THỊ (gate = false), không đổi lệnh mua.
//
// Độ đo:  X1 = C/P − 1 · R = (C − S)/C · X2 = (C − EMA21)/ATR14 · X3 = C/SMA50 − 1 (≥ 15% và ≥ phân vị 90 của chính mã trong 250 phiên)
//         X4 = tăng ≥ 15% trong 5 phiên, hoặc ≥ 2 phiên sát trần trong 5 phiên.
// Tăng nóng khi: X1 > 5% · hoặc R > 10% khi C > P · hoặc SEPA gắn EXTENDED · hoặc ≥ 2/3 của X2, X3, X4 (mã không có nền: chỉ điều kiện cuối).

export const PZ_VERSION = "PZ-v2 (hiển thị, 14/11/2026)";
export const PZ_RULES = Object.freeze({
  zoneLow: -0.03, zoneHigh: 0.05, maxRisk: 0.10,                    // vùng mua [P × 0,97 ; P × 1,05], rủi ro tới đáy nền ≤ 10% (có sẵn: SEPA)
  x2Hot: 3.0, x2Cool: 1.5, x2CoolSessions: 3,                       // khởi điểm
  x3Min: 0.15, x3Pct: 0.9, x3Window: 250,                           // khởi điểm
  x4Ret5: 0.15, x4LimitDays: 2,                                     // khởi điểm
  coolPullMin: 0.05, coolPullAtr: 1.5,                              // Tăng nóng -> Hạ nhiệt: lùi từ đỉnh ≥ max(5%, 1,5 × ATR14 / C)
  rebaseMaxDepth: 0.25, rebaseAtrRatio: 0.7, rebaseVolDry: 0.7, rsLookback: 20, rebaseMinSessions: 15,
  failSma50Sessions: 2, failOffTier1: 10, expireSessions: 60,
  heldHotSessions: 2,                                               // chống nhấp nháy: mã ĐANG GIỮ cần 2 phiên nóng liên tiếp mới rời bảng chính
  calmSessions: 2,                                                  // Tăng nóng -> về nền cũ: hết mọi độ đo nóng 2 phiên liên tiếp và giá về vùng mua / trong nền
  climaxX2: 4.5, climaxLimitDays: 3,
  boxSessions: 15, boxMaxRange: 0.12,                               // hộp giá HG-v1 (khởi điểm)
  carryBaseSessions: 60, minBars: 60,
  limitPct: Object.freeze({ HOSE: 0.07, HNX: 0.10, UPCOM: 0.15 }), nearLimit: 0.005,
});
export const PZ_STATES = Object.freeze(["BUY_ZONE", "IN_BASE", "NO_SETUP", "UNKNOWN", "EXTENDED", "COOLING", "REBASING", "FAILED"]);
export const PZ_STATE_VI = Object.freeze({
  BUY_ZONE: "Vùng mua", IN_BASE: "Trong nền", NO_SETUP: "Chưa có nền", UNKNOWN: "Chưa xác định",
  EXTENDED: "Tăng nóng", COOLING: "Hạ nhiệt", REBASING: "Dựng nền mới", FAILED: "Hỏng nền",
});
export const PZ_WATCH = new Set(["EXTENDED", "COOLING", "REBASING"]);
const HOT_VI = { x1: "Vượt pivot quá 5%", risk: "Rủi ro tới đáy nền > 10%", sepa_extended: "SEPA: đã quá vùng mua", x2: "Cách EMA21 quá 3 ATR", x3: "Cao hơn SMA50 bất thường", x4: "Tăng tốc quá nhanh" };

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ---------------------------------------------------------------- chỉ báo (chỉ dùng thanh ≤ phiên cuối của chuỗi)
export function emaLast(xs, n) {
  if (xs.length < n) return null;
  const k = 2 / (n + 1); let e = mean(xs.slice(0, n));
  for (let i = n; i < xs.length; i++) e = xs[i] * k + e * (1 - k);
  return e;
}
/** ATR Wilder trên n phiên. */
export function atrLast(bars, n) {
  if (bars.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < bars.length; i++) { const b = bars[i], p = bars[i - 1].close; tr.push(Math.max(b.high - b.low, Math.abs(b.high - p), Math.abs(b.low - p))); }
  let a = mean(tr.slice(0, n));
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}
const smaAt = (closes, end, n) => (end + 1 >= n ? mean(closes.slice(end + 1 - n, end + 1)) : null);
/** Phân vị (0–1) của giá trị cuối trong chính chuỗi — dùng cho X3 (độ kéo dãn khỏi SMA50 "bất thường của riêng mã"). */
function selfPercentile(series, v) { const s = series.filter(fin); if (s.length < 30) return null; return s.filter((x) => x <= v).length / s.length; }

/**
 * Hộp giá HG-v1 — bộ nhận diện nền DỰ PHÒNG khi SEPA / Base Breakout không có kết quả cùng phiên.
 * Nền = `boxSessions` phiên TRƯỚC phiên cuối có biên độ (cao nhất − thấp nhất) / cao nhất ≤ `boxMaxRange`, và giá trên SMA50.
 * Pivot = đỉnh hộp, đáy nền = đáy hộp. `after`: hộp phải nằm hoàn toàn sau ngày này (nền MỚI sau đỉnh H*).
 */
export function detectBox(bars, cfg = PZ_RULES, after = null) {
  const n = cfg.boxSessions;
  if (bars.length < Math.max(n + 1, 50)) return null;
  const win = bars.slice(-n - 1, -1);
  if (after && win[0].date <= after) return null;
  const hi = Math.max(...win.map((b) => b.high)), lo = Math.min(...win.map((b) => b.low));
  if (!(hi > 0) || (hi - lo) / hi > cfg.boxMaxRange) return null;
  const closes = bars.map((b) => b.close), s50 = smaAt(closes, closes.length - 1, 50);
  if (!(s50 > 0) || bars.at(-1).close < s50) return null;
  return { source: "BOX", pivot: hi, stop: lo, status: null, from: win[0].date };
}

/** Năm độ đo cho phiên cuối của chuỗi. `base` = { pivot, stop, status } hoặc null. */
export function pzMeasures(bars, base, { exchange = "HOSE", cfg = PZ_RULES } = {}) {
  const closes = bars.map((b) => b.close), vols = bars.map((b) => b.volume ?? 0), t = closes.length - 1, C = closes[t];
  const e21 = emaLast(closes, 21), s50 = smaAt(closes, t, 50), a14 = atrLast(bars, 14);
  const x2 = e21 != null && a14 > 0 ? (C - e21) / a14 : null;
  const x3 = s50 > 0 ? C / s50 - 1 : null;
  const x3Series = [];
  for (let i = Math.max(49, t - cfg.x3Window + 1); i <= t; i++) { const m = smaAt(closes, i, 50); if (m > 0) x3Series.push(closes[i] / m - 1); }
  const x3Pct = x3 != null ? selfPercentile(x3Series, x3) : null;
  const lim = cfg.limitPct[String(exchange).toUpperCase()] ?? cfg.limitPct.HOSE;
  const dayRet = (i) => (i > 0 && closes[i - 1] > 0 ? closes[i] / closes[i - 1] - 1 : null);
  const nearLimitUp = (i) => { const r = dayRet(i); return r != null && r >= lim - cfg.nearLimit; };
  const limitDays5 = [0, 1, 2, 3, 4].filter((k) => nearLimitUp(t - k)).length;
  const ret5 = t >= 5 && closes[t - 5] > 0 ? C / closes[t - 5] - 1 : null;
  const x4 = ret5 == null ? null : ret5 >= cfg.x4Ret5 || limitDays5 >= cfg.x4LimitDays;
  const P = base?.pivot > 0 ? base.pivot : null, S = base?.stop > 0 ? base.stop : null;
  const x1 = P ? C / P - 1 : null, risk = S && S < C ? (C - S) / C : S ? 0 : null;
  const v50 = t >= 49 ? mean(vols.slice(t - 49, t + 1)) : null, v5 = mean(vols.slice(t - 4, t + 1));
  const a5 = atrLast(bars.slice(-30), 5), a20 = atrLast(bars.slice(-60), 20);
  // Cao trào: X2 cực đoan, hoặc 3 phiên sát trần liên tiếp kèm một phiên có khối lượng lớn nhất 50 phiên.
  const maxVol50 = t >= 49 ? Math.max(...vols.slice(t - 49, t + 1)) : null;
  const run3 = [0, 1, 2].every((k) => nearLimitUp(t - k)), climaxVol = maxVol50 != null && [0, 1, 2].some((k) => vols[t - k] === maxVol50);
  const climax = (x2 != null && x2 >= cfg.climaxX2) || (run3 && climaxVol);
  return { C, e21, s50, a14, x1, risk, x2, x3, x3Pct, x4, ret5, limitDays5, v50, volDry: v50 > 0 ? v5 / v50 : null, atrRatio: a20 > 0 && a5 != null ? a5 / a20 : null, climax, P, S };
}

/** Lý do nóng (mảng mã) theo định nghĩa; rỗng = không nóng. */
export function hotReasons(m, base, cfg = PZ_RULES) {
  const why = [];
  if (base) {
    if (m.x1 != null && m.x1 > cfg.zoneHigh) why.push("x1");
    if (m.x1 != null && m.x1 > 0 && m.risk != null && m.risk > cfg.maxRisk) why.push("risk");
    if (base.status === "EXTENDED") why.push("sepa_extended");
  }
  const soft = [];
  if (m.x2 != null && m.x2 >= cfg.x2Hot) soft.push("x2");
  if (m.x3 != null && m.x3 >= cfg.x3Min && m.x3Pct != null && m.x3Pct >= cfg.x3Pct) soft.push("x3");
  if (m.x4) soft.push("x4");
  if (soft.length >= 2) why.push(...soft);
  return why;
}

/** Vị trí so với nền khi KHÔNG nóng: BUY_ZONE / IN_BASE / NO_SETUP. */
function zoneOf(m, base, cfg) {
  if (!base || m.x1 == null) return { state: "NO_SETUP", missing: ["Chưa nhận diện được nền giá"] };
  if (m.C <= m.S) return { state: "NO_SETUP", missing: ["Giá đã thủng đáy nền gần nhất"] };
  if (m.x1 < cfg.zoneLow) return { state: "IN_BASE", missing: [`Giá còn cách pivot ${pct(-m.x1)} (vùng mua từ −${pct(-cfg.zoneLow, 0)})`] };
  if (m.risk != null && m.risk > cfg.maxRisk) return { state: "IN_BASE", missing: [`Rủi ro tới đáy nền ${pct(m.risk)} > ${pct(cfg.maxRisk, 0)} — nền quá sâu`] };
  return { state: "BUY_ZONE", missing: [] };
}
const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const n2 = (x) => (fin(x) ? x.toFixed(2).replace(".", ",") : "—");

/**
 * Trạng thái phiên D của một mã, từ trạng thái phiên trước (máy trạng thái có nhớ).
 * @param bars    thanh giá ĐIỀU CHỈNH tăng dần, phiên cuối = D (đã lọc nến lỗi giá 0)
 * @param base    nền cùng phiên { source, pivot, stop, status } hoặc null
 * @param prev    bản ghi phiên trước của mã (hoặc null)
 * @param ctx     { date, held, tier1, exchange, rs: [[date, C/VNIndex]] (tuỳ chọn), sameSession: bool }
 */
export function pzStep({ bars, base, prev: prev0 = null, ctx, cfg = PZ_RULES }) {
  const date = ctx.date, held = Boolean(ctx.held);
  // Phiên "Chưa xác định" (thiếu / lệch dữ liệu) KHÔNG xoá lịch sử: bản ghi giữ trạng thái thật gần nhất trong `resume`, phiên sau đi tiếp từ đó.
  const prev = prev0?.state === "UNKNOWN" ? prev0.resume ?? null : prev0;
  const unknown = (whyVi) => ({ state: "UNKNOWN", from: prev0?.state ?? null, since: prev0?.state === "UNKNOWN" ? prev0.since : date, sessions: prev0?.state === "UNKNOWN" ? (prev0.sessions ?? 0) + 1 : 1,
    lane: held ? "CORE" : null, held, reasonVi: prev0?.state === "UNKNOWN" ? null : whyVi, missingVi: [whyVi], hotReasons: [], measures: null, base: null, rebase: null,
    hStar: prev?.hStar ?? null, hStarDate: prev?.hStarDate ?? null, watchSince: prev?.watchSince ?? null, counters: prev?.counters ?? {}, carry: prev?.carry ?? null,
    resume: prev ? { ...prev, resume: undefined } : null });
  if (!bars || bars.length < cfg.minBars) return unknown(`Chưa đủ ${cfg.minBars} phiên giá điều chỉnh`);
  if (bars.at(-1).date !== date) return unknown(`Giá mới tới phiên ${bars.at(-1).date}, khác phiên của bảng`);
  if (ctx.sameSession === false) return unknown("Nguồn dữ liệu lệch phiên");

  // Nền: nền cùng phiên; không có thì giữ nền đã biết (pivot đã bị vượt vẫn là mốc) trong tối đa carryBaseSessions phiên.
  const carryOk = prev?.carry && (prev.carry.age ?? 0) < cfg.carryBaseSessions;
  const useBase = base ?? (carryOk ? { ...prev.carry, source: prev.carry.source } : null);
  const m = pzMeasures(bars, useBase, { exchange: ctx.exchange, cfg });
  const why = hotReasons(m, useBase, cfg);
  const c = { ...(prev?.counters ?? {}) };
  c.hot = why.length ? (c.hot ?? 0) + 1 : 0;
  c.calm = why.length ? 0 : (c.calm ?? 0) + 1;
  c.lowX2 = m.x2 != null && m.x2 < cfg.x2Cool ? (c.lowX2 ?? 0) + 1 : 0;
  c.belowSma = m.s50 > 0 && m.C < m.s50 && m.v50 > 0 && (bars.at(-1).volume ?? 0) > m.v50 ? (c.belowSma ?? 0) + 1 : 0;
  c.offT1 = ctx.tier1 ? 0 : (c.offT1 ?? 0) + 1;
  let hStar = prev?.hStar ?? null, hStarDate = prev?.hStarDate ?? null, watchSince = prev?.watchSince ?? null;
  const prevState = prev?.state ?? null;
  let state, missing = [], reasonVi = null;

  const enterHot = () => { state = "EXTENDED"; hStar = m.C; hStarDate = date; watchSince ??= date; reasonVi = `Tăng nóng: ${why.map((k) => HOT_VI[k]).join(", ")}`; };
  const depth = hStar > 0 ? 1 - m.C / hStar : null;
  const rsHolds = (() => {
    const rs = ctx.rs; if (!rs?.length || !hStarDate) return null;
    const before = rs.filter(([d]) => d < hStarDate).slice(-cfg.rsLookback), now = rs.at(-1);
    if (before.length < 5 || !now || now[0] !== date) return null;
    return now[1] >= Math.min(...before.map((x) => x[1]));
  })();
  const failWhy = () => {
    if (depth != null && depth > cfg.rebaseMaxDepth) return `Điều chỉnh sâu ${pct(depth)} từ đỉnh (> ${pct(cfg.rebaseMaxDepth, 0)})`;
    if (c.belowSma >= cfg.failSma50Sessions) return `Đóng cửa dưới SMA50 ${c.belowSma} phiên với khối lượng lớn`;
    if (c.offT1 >= cfg.failOffTier1) return `Rớt khỏi tầng 1 của Hợp lưu ${c.offT1} phiên liên tiếp`;
    return null;
  };
  // Lùi về VÙNG MUA của nền cũ (kiểm định lại điểm phá vỡ) hoặc vào lại trong nền cũ: mã đã hết "đắt" so với nền — quay về bảng chính
  // mà không phải chờ dựng nền mới. Điều kiện: không còn độ đo nóng nào, giá trên SMA50, rủi ro tới đáy nền ≤ ngưỡng. (Bổ sung 14/11/2026
  // sau khi phát lại trên dữ liệu thật: thiếu đường này thì mã đã lùi về pivot vẫn kẹt ở "Hạ nhiệt" 15+ phiên.)
  const retest = () => {
    if (!useBase || m.x1 == null || why.length || !(m.s50 > 0 && m.C > m.s50)) return null;
    if (m.x1 >= cfg.zoneLow && m.x1 <= cfg.zoneHigh && m.risk != null && m.risk <= cfg.maxRisk) return { state: "BUY_ZONE", reasonVi: `Lùi về vùng mua của nền cũ (${m.x1 >= 0 ? "+" : "−"}${pct(Math.abs(m.x1))} so pivot)` };
    if (m.x1 < cfg.zoneLow && m.S > 0 && m.C > m.S) return { state: "IN_BASE", reasonVi: "Lùi về lại trong nền cũ" };
    return null;
  };
  const rebaseChecks = () => [
    { key: "depth", ok: depth != null && depth <= cfg.rebaseMaxDepth && m.s50 > 0 && m.C > m.s50, vi: depth == null ? "Chưa đo được độ sâu" : `Độ sâu ${pct(depth)} và giá trên SMA50` },
    { key: "tight", ok: m.atrRatio != null && m.atrRatio <= cfg.rebaseAtrRatio, vi: m.atrRatio == null ? "Chưa đo được biên độ" : `Biên độ ATR5/ATR20 = ${n2(m.atrRatio)} (cần ≤ ${n2(cfg.rebaseAtrRatio)})` },
    { key: "dry", ok: m.volDry != null && m.volDry <= cfg.rebaseVolDry, vi: m.volDry == null ? "Chưa đo được khối lượng" : `Khối lượng 5 phiên = ${n2(m.volDry)} × TB50 (cần ≤ ${n2(cfg.rebaseVolDry)})` },
    { key: "rs", ok: rsHolds === true, vi: rsHolds == null ? "Chưa đo được sức mạnh so VN-Index" : rsHolds ? "Sức mạnh so VN-Index giữ đáy" : "Sức mạnh so VN-Index thủng đáy trước đỉnh" },
  ];

  if (prevState === "EXTENDED") {
    if (m.C > hStar) { hStar = m.C; hStarDate = date; }
    const pull = Math.max(cfg.coolPullMin, m.a14 > 0 ? (cfg.coolPullAtr * m.a14) / m.C : 0);
    const calmBack = c.calm >= cfg.calmSessions ? retest() : null;
    if (calmBack) { state = calmBack.state; reasonVi = `${calmBack.reasonVi} — hết tín hiệu nóng ${c.calm} phiên`; }
    else if (m.C <= hStar * (1 - pull)) { const rt = retest(); if (rt) { state = rt.state; reasonVi = rt.reasonVi; } else { state = "COOLING"; reasonVi = `Lùi ${pct(1 - m.C / hStar)} từ đỉnh`; } }
    else if (c.lowX2 >= cfg.x2CoolSessions) { state = "COOLING"; reasonVi = `Giá đi ngang, cách EMA21 dưới ${String(cfg.x2Cool).replace(".", ",")} ATR ${c.lowX2} phiên`; }
    else { state = "EXTENDED"; missing = [`Chờ lùi ≥ ${pct(pull)} từ đỉnh, hoặc đi ngang ${cfg.x2CoolSessions} phiên`]; }
  } else if (prevState === "COOLING" || prevState === "REBASING") {
    if (m.C > hStar && prevState === "COOLING") { enterHot(); }
    else if (failWhy()) { state = "FAILED"; reasonVi = failWhy(); }
    else if (retest()) { const rt = retest(); state = rt.state; reasonVi = rt.reasonVi; }
    else {
      const checks = rebaseChecks(), allOk = checks.every((x) => x.ok);
      const sessionsSinceTop = hStarDate ? bars.filter((b) => b.date > hStarDate).length : 0;
      // Nền MỚI: nguồn cùng phiên có pivot dưới đỉnh cũ, hoặc hộp giá dựng HOÀN TOÀN sau đỉnh H*.
      const fresh = (base && base.pivot > 0 && base.pivot <= hStar * 1.02 ? base : null) ?? detectBox(bars, cfg, hStarDate);
      if (prevState === "COOLING") {
        if (allOk) { state = "REBASING"; reasonVi = "Đủ bốn điều kiện dựng nền"; }
        else { state = "COOLING"; missing = checks.filter((x) => !x.ok).map((x) => x.vi); }
      } else {
        const mz = fresh ? pzMeasures(bars, fresh, { exchange: ctx.exchange, cfg }) : null;
        const zoneOk = mz && mz.x1 >= cfg.zoneLow && mz.x1 <= cfg.zoneHigh && mz.risk != null && mz.risk <= cfg.maxRisk;
        if (sessionsSinceTop >= cfg.rebaseMinSessions && zoneOk && !hotReasons(mz, fresh, cfg).length) {
          state = "BUY_ZONE"; reasonVi = `Nền mới ${sessionsSinceTop} phiên, về vùng mua quanh pivot ${Math.round(fresh.pivot).toLocaleString("vi-VN")}`;
          hStar = null; hStarDate = null; watchSince = null; c.hot = 0;
          return finish(fresh, mz);
        }
        if (m.C > hStar && why.length) { enterHot(); }
        else {
          state = "REBASING";
          missing = [
            ...(sessionsSinceTop < cfg.rebaseMinSessions ? [`Nền mới ${sessionsSinceTop}/${cfg.rebaseMinSessions} phiên`] : []),
            ...(!fresh ? ["Chưa có pivot của nền mới"] : !zoneOk ? [`Giá chưa về vùng mua của nền mới (pivot ${Math.round(fresh.pivot).toLocaleString("vi-VN")})`] : []),
            ...checks.filter((x) => !x.ok).map((x) => x.vi),
          ];
        }
      }
    }
    // Hết hạn (chỉ mã CHƯA giữ): quá expireSessions phiên trong bảng theo dõi mà không về vùng mua.
    if (!held && PZ_WATCH.has(state) && watchSince && bars.filter((b) => b.date > watchSince).length >= cfg.expireSessions) { state = "FAILED"; reasonVi = `Hết hạn: ${cfg.expireSessions} phiên chưa về vùng mua`; }
  } else {
    // Ngoài bảng theo dõi: vào Tăng nóng ngay (mã chưa giữ) hoặc sau heldHotSessions phiên liên tiếp (mã đang giữ).
    const need = held ? cfg.heldHotSessions : 1;
    if (why.length && c.hot >= need) enterHot();
    else {
      const z = zoneOf(m, useBase, cfg); state = z.state; missing = z.missing;
      if (why.length) missing = [`Tín hiệu nóng phiên ${c.hot}/${need} (${why.map((k) => HOT_VI[k]).join(", ")}) — chưa rời bảng chính`, ...missing];
    }
  }
  // FAILED: rời bảng theo dõi; phiên sau mã được phân loại lại từ đầu (nhánh "ngoài bảng theo dõi").
  return finish(useBase, m);

  function finish(b, mm) {
    const watch = PZ_WATCH.has(state);
    // Còn thiếu luôn có nội dung cho mã ở bảng theo dõi (kể cả phiên vừa chuyển trạng thái).
    if (!missing.length && state === "EXTENDED") { const pull = Math.max(cfg.coolPullMin, mm.a14 > 0 ? (cfg.coolPullAtr * mm.a14) / mm.C : 0); missing = [`Chờ lùi ≥ ${pct(pull)} từ đỉnh, hoặc đi ngang ${cfg.x2CoolSessions} phiên`]; }
    if (!missing.length && (state === "COOLING" || state === "REBASING")) missing = rebaseChecks().filter((x) => !x.ok).map((x) => x.vi);
    if (!watch && state !== "FAILED") { watchSince = null; hStar = null; hStarDate = null; }
    const lane = watch || state === "FAILED" ? (held ? "RUNNER" : state === "FAILED" ? null : "WAIT") : held ? "CORE" : null;
    const since = prevState === state ? prev.since : date, sessions = prevState === state ? (prev.sessions ?? 0) + 1 : 1;
    const carry = b ? { source: b.source, pivot: b.pivot, stop: b.stop, status: b.status ?? null, age: base && b === base ? 0 : (prev?.carry?.age ?? 0) + 1 } : null;
    return {
      state, from: prevState, since, sessions, lane, held, reasonVi: prevState !== state ? reasonVi ?? `Vào trạng thái ${PZ_STATE_VI[state]}` : null,
      hotReasons: why, missingVi: missing,
      base: b ? { source: b.source, pivot: r4(b.pivot), stop: r4(b.stop), status: b.status ?? null } : null,
      measures: {
        close: mm.C, x1: r4(mm.x1), risk: r4(mm.risk), x2: r4(mm.x2), x3: r4(mm.x3), x3Pct: r4(mm.x3Pct), x4: mm.x4, ret5: r4(mm.ret5),
        volDry: r4(mm.volDry), atrRatio: r4(mm.atrRatio), depth: hStar > 0 ? r4(1 - mm.C / hStar) : null, rsHolds, climax: Boolean(mm.climax),
        zoneLow: b?.pivot > 0 ? r4(b.pivot * (1 + cfg.zoneLow)) : null, zoneHigh: b?.pivot > 0 ? r4(b.pivot * (1 + cfg.zoneHigh)) : null,
      },
      rebase: watch && state !== "EXTENDED" ? rebaseChecks().map(({ key, ok, vi }) => ({ key, ok, vi })) : null,
      hStar: r4(hStar), hStarDate, watchSince, counters: c, carry,
    };
  }
}

/** Gọn cho API: bản ghi phiên -> PzPosition gửi giao diện. */
export function pzPublic(rec) {
  if (!rec) return null;
  const m = rec.measures ?? {};
  return {
    state: rec.state, lane: rec.lane, since: rec.since, sessions: rec.sessions, baseSource: rec.base?.source ?? null,
    pivot: rec.base?.pivot ?? null, stopRef: rec.base?.stop ?? null, zoneLow: m.zoneLow ?? null, zoneHigh: m.zoneHigh ?? null,
    x1: m.x1 ?? null, risk: m.risk ?? null, x2: m.x2 ?? null, x3: m.x3 ?? null, x4: m.x4 ?? null,
    depth: m.depth ?? null, volDry: m.volDry ?? null, atrRatio: m.atrRatio ?? null, rsHolds: m.rsHolds ?? null,
    hotReasons: rec.hotReasons ?? [], missingVi: rec.missingVi ?? [], rebase: rec.rebase ?? null, climax: Boolean(m.climax),
    hStar: rec.hStar ?? null, reasonVi: rec.reasonVi ?? null,
  };
}
