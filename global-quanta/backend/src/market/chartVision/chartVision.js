// AI Chart Vision v2 — phân tích cấu trúc ĐA KHUNG (ngày · tuần · tháng) tính trực tiếp từ chuỗi giá điều chỉnh của Gateway.
//
// Thay cho pipeline cũ (api/scan.js trên Vercel): pipeline đó chỉ phân tích khung ĐẦU TIÊN được chọn (chọn 1h trước -> lỗi
// "chưa cấu hình nguồn" vì nguồn chỉ có nến ngày) và bắt buộc có khóa AI. Ở đây mọi con số đều tính từ nến thật, point-in-time
// tại phiên cuối, và phần tổng hợp là QUY TẮC MINH BẠCH (không gọi AI, không nhìn trước) — chưa kiểm định ngoài mẫu.
//
// Mỗi khung: xu hướng theo MA, động lượng (RSI 14 Wilder, MACD 12-26-9, ADX/DI 14), cấu trúc đỉnh–đáy (zigzag của engine Pring),
// vùng hỗ trợ/kháng cự gom từ pivot (đếm số lần chạm), khối lượng (tăng/giảm 20 thanh), mô hình giá Pring (ngày + tuần).
// Hợp lưu đa khung: trọng số D 0,45 · W 0,35 · M 0,20 (chia lại khi thiếu khung), kịch bản tăng/giảm và mức vô hiệu.

import { analyzePatterns, isPartialWeek, summarizePattern, weeklyBars } from "../strategies/patternScan.js";
import { atrOf, pivotsAt, preparePattern } from "../strategies/pring/index.js";

export const CHART_VISION_ENGINE = "chart-vision/V1";
export const CV_TIMEFRAMES = Object.freeze(["D", "W", "M"]);
const TF = Object.freeze({
  D: { label: "Ngày", ma: [20, 50, 200], degree: "intermediate", levelBars: 250, sketchBars: 180, weight: 0.45 },
  W: { label: "Tuần", ma: [10, 30, 40], degree: "minor", levelBars: 156, sketchBars: 120, weight: 0.35 },
  M: { label: "Tháng", ma: [6, 12, 24], degree: "minor", levelBars: 120, sketchBars: 60, weight: 0.2 },
});
const W_SCORE = Object.freeze({ trend: 0.35, momentum: 0.25, structure: 0.25, volume: 0.15 });

const clip = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const fmt = (x) => (x == null || !Number.isFinite(x) ? "—" : Math.round(x).toLocaleString("vi-VN"));

// ------------------------------------------------------------------ nến tháng

export function monthlyBars(bars) {
  const out = [];
  for (const b of bars) {
    const k = b.date.slice(0, 7), m = out[out.length - 1];
    if (!m || m.key !== k) out.push({ key: k, date: b.date, monthStart: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 });
    else { m.date = b.date; m.high = Math.max(m.high, b.high); m.low = Math.min(m.low, b.low); m.close = b.close; m.volume += b.volume ?? 0; }
  }
  return out.map(({ key, ...m }) => m);
}

/** Tháng cuối chưa trọn: còn ngày giao dịch sau phiên cuối trong tháng (xấp xỉ: phiên cuối < ngày 25 hoặc chưa qua ngày làm việc cuối tháng). */
export function isPartialMonth(lastDate) {
  if (!lastDate) return false;
  const d = new Date(`${lastDate}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  while (end.getUTCDay() === 0 || end.getUTCDay() === 6) end.setUTCDate(end.getUTCDate() - 1);
  return lastDate < end.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ chỉ báo (mảng, giá trị tại i chỉ dùng dữ liệu ≤ i)

export function sma(v, n) {
  const out = new Array(v.length).fill(NaN); let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
export function ema(v, n) {
  const out = new Array(v.length).fill(NaN), k = 2 / (n + 1);
  if (v.length < n) return out;
  let e = 0; for (let i = 0; i < n; i++) e += v[i]; e /= n; out[n - 1] = e;
  for (let i = n; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
export function rsi(C, n = 14) {
  const out = new Array(C.length).fill(NaN);
  if (C.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = C[i] - C[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < C.length; i++) {
    const d = C[i] - C[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
export function macd(C, f = 12, s = 26, sig = 9) {
  const ef = ema(C, f), es = ema(C, s), line = C.map((_, i) => ef[i] - es[i]);
  const start = line.findIndex(Number.isFinite);
  const signal = new Array(C.length).fill(NaN);
  if (start >= 0) { const e = ema(line.slice(start), sig); for (let i = 0; i < e.length; i++) signal[start + i] = e[i]; }
  return { line, signal, hist: line.map((x, i) => x - signal[i]) };
}
/** ADX / +DI / −DI (Wilder). */
export function adx(H, L, C, n = 14) {
  const len = C.length, pdi = new Array(len).fill(NaN), mdi = new Array(len).fill(NaN), ax = new Array(len).fill(NaN);
  if (len < 2 * n + 1) return { adx: ax, pdi, mdi };
  let tr = 0, pd = 0, md = 0; const dx = new Array(len).fill(NaN);
  for (let i = 1; i < len; i++) {
    const up = H[i] - H[i - 1], dn = L[i - 1] - L[i];
    const t = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pd += p; md += m; if (i < n) continue; }
    else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; }
    pdi[i] = tr ? (100 * pd) / tr : 0; mdi[i] = tr ? (100 * md) / tr : 0;
    const s = pdi[i] + mdi[i]; dx[i] = s ? (100 * Math.abs(pdi[i] - mdi[i])) / s : 0;
  }
  let a = 0; for (let i = n; i < 2 * n; i++) a += dx[i]; a /= n; ax[2 * n - 1] = a;
  for (let i = 2 * n; i < len; i++) { a = (a * (n - 1) + dx[i]) / n; ax[i] = a; }
  return { adx: ax, pdi, mdi };
}

// ------------------------------------------------------------------ cấu trúc & vùng giá

/** Cấu trúc từ 2 đỉnh + 2 đáy pivot gần nhất (đã xác nhận ≤ t) và vị trí giá so với pivot gần nhất. */
export function structureOf(S, t, piv) {
  const highs = piv.filter((p) => p.type === "H").slice(-2), lows = piv.filter((p) => p.type === "L").slice(-2);
  const c = S.C[t];
  let kind = "MIXED", label = "Đan xen (chưa rõ xu hướng)";
  if (highs.length === 2 && lows.length === 2) {
    const hh = highs[1].price > highs[0].price, hl = lows[1].price > lows[0].price;
    if (hh && hl) { kind = "UP"; label = "Đỉnh và đáy cao dần (xu hướng tăng)"; }
    else if (!hh && !hl) { kind = "DOWN"; label = "Đỉnh và đáy thấp dần (xu hướng giảm)"; }
    else if (!hh && hl) { kind = "CONTRACT"; label = "Đỉnh thấp dần, đáy cao dần (thu hẹp)"; }
    else { kind = "EXPAND"; label = "Đỉnh cao dần, đáy thấp dần (mở rộng)"; }
  }
  const lastH = highs.at(-1) ?? null, lastL = lows.at(-1) ?? null;
  const event = lastH && c > lastH.price ? { kind: "BREAK_UP", label: `Đóng cửa vượt đỉnh pivot gần nhất ${fmt(lastH.price)} (${lastH.date})` }
    : lastL && c < lastL.price ? { kind: "BREAK_DOWN", label: `Đóng cửa thủng đáy pivot gần nhất ${fmt(lastL.price)} (${lastL.date})` }
    : null;
  return { kind, label, event, highs: highs.map(pt), lows: lows.map(pt) };
}
const pt = (p) => ({ date: p.date, price: r2(p.price), type: p.type });

/** Gom pivot (bậc nhỏ + trung) trong `lookback` thanh thành vùng giá; dung sai max(1,5%, 0,5×ATR). */
export function levelsOf(S, t, lookback) {
  const a = Math.max(0, t - lookback);
  const seen = new Set(), piv = [];
  for (const d of ["minor", "intermediate"]) for (const p of pivotsAt(S, t, d)) if (p.i >= a && !seen.has(`${p.type}${p.i}`)) { seen.add(`${p.type}${p.i}`); piv.push(p); }
  piv.sort((x, y) => x.price - y.price);
  const atr = atrOf(S)[t], c = S.C[t];
  const tol = Math.max(0.015 * c, Number.isFinite(atr) ? 0.5 * atr : 0);
  const zones = [];
  for (const p of piv) {
    const z = zones[zones.length - 1];
    if (z && p.price - z.hi <= tol) { z.pts.push(p); z.hi = p.price; }
    else zones.push({ lo: p.price, hi: p.price, pts: [p] });
  }
  return zones.map((z) => {
    const price = z.pts.reduce((s, p) => s + p.price, 0) / z.pts.length;
    const last = z.pts.reduce((m, p) => (p.i > m.i ? p : m));
    return { price: r2(price), lo: r2(z.lo), hi: r2(z.hi), touches: z.pts.length, lastDate: last.date, firstDate: z.pts.reduce((m, p) => (p.i < m.i ? p : m)).date };
  });
}

// ------------------------------------------------------------------ một khung

export function analyzeTimeframe(bars, tf) {
  const cfg = TF[tf];
  const S = preparePattern(bars), t = S.n - 1;
  if (t < 30) return { tf, label: cfg.label, bars: S.n, insufficient: true, note: `Chỉ có ${S.n} nến ${cfg.label.toLowerCase()} — chưa đủ để phân tích.` };
  const C = Array.from(S.C), H = Array.from(S.H), L = Array.from(S.L), V = Array.from(S.V);
  const c = C[t];
  // xu hướng theo MA
  const mas = cfg.ma.map((n) => ({ n, v: sma(C, n)[t] }));
  const slow = sma(C, cfg.ma[2]), slope = Number.isFinite(slow[t]) && Number.isFinite(slow[t - 5]) ? slow[t] / slow[t - 5] - 1 : NaN;
  const trendChecks = [
    ...mas.map((m) => ({ key: `ma${m.n}`, label: `Giá trên MA${m.n}`, ok: Number.isFinite(m.v) ? c > m.v : null, value: r2(m.v) })),
    { key: "maOrder", label: `MA${cfg.ma[1]} trên MA${cfg.ma[2]}`, ok: Number.isFinite(mas[1].v) && Number.isFinite(mas[2].v) ? mas[1].v > mas[2].v : null },
    { key: "slope", label: `MA${cfg.ma[2]} dốc lên (5 thanh)`, ok: Number.isFinite(slope) ? slope > 0 : null, value: r2(slope * 100) },
  ];
  const known = trendChecks.filter((x) => x.ok != null);
  const trend = known.length ? (2 * known.filter((x) => x.ok).length) / known.length - 1 : 0;
  // động lượng
  const rs = rsi(C)[t], m = macd(C), hist = m.hist[t], histPrev = m.hist[t - 1];
  const dmi = adx(H, L, C), ax = dmi.adx[t];
  const momParts = [];
  if (Number.isFinite(rs)) momParts.push(clip((rs - 50) / 25));
  if (Number.isFinite(hist) && Number.isFinite(histPrev)) momParts.push(hist > 0 ? (hist >= histPrev ? 1 : 0.5) : hist <= histPrev ? -1 : -0.5);
  const momentum = momParts.length ? momParts.reduce((s, x) => s + x, 0) / momParts.length : 0;
  // cấu trúc
  const piv = pivotsAt(S, t, cfg.degree);
  const st = structureOf(S, t, piv);
  const structure = clip(({ UP: 1, DOWN: -1, CONTRACT: 0, EXPAND: 0, MIXED: 0 })[st.kind] + (st.event?.kind === "BREAK_UP" ? 0.5 : st.event?.kind === "BREAK_DOWN" ? -0.5 : 0));
  // khối lượng: KL phiên tăng / phiên giảm trong 20 thanh; KL thanh cuối so TB20 trước đó
  let upV = 0, dnV = 0; for (let i = Math.max(1, t - 19); i <= t; i++) { if (C[i] > C[i - 1]) upV += V[i]; else if (C[i] < C[i - 1]) dnV += V[i]; }
  const udr = dnV > 0 ? upV / dnV : upV > 0 ? 4 : 1;
  const avg20 = sma(V, 20)[t - 1];
  const volume = clip(Math.log2(udr));
  const score = Math.round(100 * (W_SCORE.trend * trend + W_SCORE.momentum * momentum + W_SCORE.structure * structure + W_SCORE.volume * volume));
  const atr = atrOf(S)[t];
  const levels = levelsOf(S, t, cfg.levelBars);
  const support = levels.filter((z) => z.hi < c).sort((x, y) => y.price - x.price).slice(0, 3);
  const resistance = levels.filter((z) => z.lo > c).sort((x, y) => x.price - y.price).slice(0, 3);
  return {
    tf, label: cfg.label, bars: S.n, date: S.date[t], close: r2(c), changePct: r2((c / C[t - 1] - 1) * 100),
    score, bias: biasOf(score),
    components: { trend: r2(trend), momentum: r2(momentum), structure: r2(structure), volume: r2(volume) },
    trend: { checks: trendChecks, mas: mas.map((x) => ({ n: x.n, value: r2(x.v), distPct: Number.isFinite(x.v) ? r2((c / x.v - 1) * 100) : null })) },
    momentum: {
      rsi: r1(rs), rsiZone: !Number.isFinite(rs) ? null : rs >= 70 ? "Quá mua" : rs <= 30 ? "Quá bán" : rs >= 50 ? "Trên 50" : "Dưới 50",
      macd: Number.isFinite(hist) ? { line: r2(m.line[t]), signal: r2(m.signal[t]), hist: r2(hist), rising: hist >= histPrev, cross: Math.sign(hist) !== Math.sign(histPrev) ? (hist > 0 ? "UP" : "DOWN") : null } : null,
      adx: Number.isFinite(ax) ? { value: r1(ax), pdi: r1(dmi.pdi[t]), mdi: r1(dmi.mdi[t]), strength: ax >= 25 ? "Có xu hướng" : ax >= 20 ? "Xu hướng yếu" : "Đi ngang" } : null,
    },
    structure: { ...st, pivots: piv.slice(-8).map(pt) },
    levels: { support, resistance, all: levels.filter((z) => z.touches >= 2 || Math.abs(z.price / c - 1) < 0.15).slice(-24) },
    volume: { upDownRatio: r2(udr), lastVsAvg20: avg20 > 0 ? r2(V[t] / avg20) : null },
    atrPct: Number.isFinite(atr) ? r2((atr / c) * 100) : null,
  };
}

export function biasOf(score) {
  return score >= 40 ? { key: "STRONG_UP", label: "Tăng mạnh" } : score >= 15 ? { key: "UP", label: "Nghiêng tăng" }
    : score > -15 ? { key: "NEUTRAL", label: "Trung tính" } : score > -40 ? { key: "DOWN", label: "Nghiêng giảm" } : { key: "STRONG_DOWN", label: "Giảm mạnh" };
}

// ------------------------------------------------------------------ hợp lưu đa khung

export function synthesize(frames, patterns, screeners) {
  const ok = frames.filter((f) => !f.insufficient);
  const wsum = ok.reduce((s, f) => s + TF[f.tf].weight, 0);
  const score = wsum ? Math.round(ok.reduce((s, f) => s + TF[f.tf].weight * f.score, 0) / wsum) : 0;
  const bias = biasOf(score);
  const signs = ok.map((f) => (f.score >= 15 ? 1 : f.score <= -15 ? -1 : 0));
  const alignment = !ok.length ? { key: "NONE", label: "Chưa đủ dữ liệu" }
    : signs.every((s) => s === 1) ? { key: "ALIGNED_UP", label: "Đồng thuận tăng mọi khung" }
    : signs.every((s) => s === -1) ? { key: "ALIGNED_DOWN", label: "Đồng thuận giảm mọi khung" }
    : signs.includes(1) && signs.includes(-1) ? { key: "CONFLICT", label: "Các khung mâu thuẫn" } : { key: "PARTIAL", label: "Đồng thuận một phần" };
  const D = ok.find((f) => f.tf === "D"), Wk = ok.find((f) => f.tf === "W"), M = ok.find((f) => f.tf === "M");
  const support = [], conflict = [];
  for (const f of ok) {
    const line = `${f.label}: ${f.bias.label} (${f.score > 0 ? "+" : ""}${f.score}) — ${f.structure.label.toLowerCase()}`;
    (f.score >= 0 === score >= 0 ? support : conflict).push(line);
    if (f.momentum.rsiZone === "Quá mua" && score > 0) conflict.push(`${f.label}: RSI ${String(f.momentum.rsi).replace(".", ",")} vùng quá mua`);
    if (f.momentum.rsiZone === "Quá bán" && score < 0) conflict.push(`${f.label}: RSI ${String(f.momentum.rsi).replace(".", ",")} vùng quá bán`);
    if (f.structure.event) (f.structure.event.kind === "BREAK_UP" === score >= 0 ? support : conflict).push(`${f.label}: ${f.structure.event.label}`);
  }
  const active = patterns.filter((p) => ["BREAKOUT", "CONFIRMED", "PULLBACK", "FORMING"].includes(p.state)).slice(0, 3);
  for (const p of active) ((p.dir === "bull") === (score >= 0) ? support : conflict).push(`Mô hình ${p.label} (${p.timeframe === "W" ? "tuần" : "ngày"}) — ${p.stateLabel}${p.checksTotal ? `, đạt ${p.checksOk}/${p.checksTotal} tiêu chí Pring` : ""}`);
  const ref = D ?? Wk ?? M;
  const s1 = ref?.levels.support[0] ?? null, r1v = ref?.levels.resistance[0] ?? null;
  const s2 = ref?.levels.support[1] ?? null, r2v = ref?.levels.resistance[1] ?? null;
  const scenarios = [];
  if (r1v) scenarios.push({ dir: "up", label: `Đóng cửa ${ref.label.toLowerCase()} vượt ${fmt(r1v.hi)} (kháng cự ${r1v.touches} lần chạm)`, then: r2v ? `mục tiêu kế tiếp vùng ${fmt(r2v.price)}` : "không còn kháng cự gần trong dữ liệu" });
  if (s1) scenarios.push({ dir: "down", label: `Đóng cửa ${ref.label.toLowerCase()} thủng ${fmt(s1.lo)} (hỗ trợ ${s1.touches} lần chạm)`, then: s2 ? `rủi ro về vùng ${fmt(s2.price)}` : "không còn hỗ trợ gần trong dữ liệu" });
  const invalidation = score >= 0 ? s1?.lo ?? null : r1v?.hi ?? null;
  const thesis = !ref ? "Chưa đủ dữ liệu để kết luận."
    : `${bias.label} (${score > 0 ? "+" : ""}${score}/100) — ${alignment.label.toLowerCase()}. ` +
      `${M ? `Tháng ${M.bias.label.toLowerCase()}, ` : ""}${Wk ? `tuần ${Wk.bias.label.toLowerCase()}, ` : ""}${D ? `ngày ${D.bias.label.toLowerCase()}.` : ""}`;
  const conclusion = !ref ? "—" : score >= 15
    ? `Ưu tiên kịch bản tăng khi giá giữ trên ${fmt(invalidation)}; ${r1v ? `xác nhận thêm khi vượt ${fmt(r1v.hi)}.` : "giá đang ở vùng không có kháng cự gần."}`
    : score <= -15
      ? `Ưu tiên phòng thủ khi giá dưới ${fmt(invalidation)}; ${s1 ? `rủi ro mở rộng nếu thủng ${fmt(s1.lo)}.` : "không còn hỗ trợ gần trong dữ liệu."}`
      : `Chờ tín hiệu: vượt ${fmt(r1v?.hi)} nghiêng tăng, thủng ${fmt(s1?.lo)} nghiêng giảm.`;
  const checklist = [
    { label: "Khung tháng & tuần cùng chiều", passed: Boolean(M && Wk && Math.sign(M.score) === Math.sign(Wk.score) && Math.abs(Wk.score) >= 15), detail: `${M ? M.score : "—"} · ${Wk ? Wk.score : "—"}` },
    { label: "Khung ngày cùng chiều khung tuần", passed: Boolean(D && Wk && Math.sign(D.score) === Math.sign(Wk.score) && Math.abs(D.score) >= 15), detail: `${D ? D.score : "—"} · ${Wk ? Wk.score : "—"}` },
    { label: "Xu hướng ngày có lực (ADX ≥ 20)", passed: (D?.momentum.adx?.value ?? 0) >= 20, detail: D?.momentum.adx ? `ADX ${String(D.momentum.adx.value).replace(".", ",")}` : "—" },
    { label: "Khối lượng ủng hộ (tăng/giảm 20 phiên cùng chiều)", passed: D ? (score >= 0 ? D.volume.upDownRatio >= 1 : D.volume.upDownRatio < 1) : false, detail: D ? `${String(D.volume.upDownRatio).replace(".", ",")}×` : "—" },
    { label: "Có mô hình giá Pring cùng chiều đang hiệu lực", passed: active.some((p) => (p.dir === "bull") === (score >= 0) && p.state !== "FORMING"), detail: active[0] ? `${active[0].label} · ${active[0].stateLabel}` : "không có" },
    { label: "Có mặt trong ít nhất một bộ lọc", passed: screeners.length > 0, detail: screeners.map((s) => s.label).join(", ") || "không" },
  ];
  return { score, bias, alignment, thesis, support, conflict, scenarios, invalidation: r2(invalidation), conclusion, checklist, weights: Object.fromEntries(ok.map((f) => [f.tf, r2(TF[f.tf].weight / wsum)])) };
}

// ------------------------------------------------------------------ toàn bộ

const compact = (b) => [b.date, r2(b.open), r2(b.high), r2(b.low), r2(b.close), Math.round(b.volume ?? 0)];

/**
 * @param bars  nến ngày điều chỉnh (đã lọc partial, OHLC > 0)
 * @param opts  { screeners: [{ strategy, label, status, … }] } — mã có mặt trong các bộ lọc (đọc từ KV)
 */
export function chartVision(symbol, bars, { screeners = [], isIndex = false } = {}) {
  const series = { D: bars, W: weeklyBars(bars), M: monthlyBars(bars) };
  const frames = CV_TIMEFRAMES.map((tf) => analyzeTimeframe(series[tf], tf));
  const pa = isIndex || bars.length <= 60 ? { daily: [], weekly: [] } : analyzePatterns(bars);
  const patterns = [...pa.daily, ...pa.weekly].map(summarizePattern);
  const last = bars.at(-1)?.date ?? null;
  return {
    symbol, engine: CHART_VISION_ENGINE, dataAsOf: last, isIndex,
    partial: { week: isPartialWeek(last), month: isPartialMonth(last) },
    frames, patterns, screeners,
    synthesis: synthesize(frames, patterns, screeners),
    method: {
      label: "EXPERIMENTAL",
      note: "Tổng hợp theo quy tắc minh bạch từ nến thật (không gọi AI): xu hướng MA 35% · động lượng RSI/MACD 25% · cấu trúc đỉnh–đáy 25% · khối lượng 15%; hợp lưu D 45% · W 35% · M 20%. Chưa kiểm định ngoài mẫu — dùng để tham khảo.",
    },
    bars: Object.fromEntries(CV_TIMEFRAMES.map((tf) => [tf, series[tf].slice(-TF[tf].sketchBars).map(compact)])),
    // đường MA cho cửa sổ vẽ, tính trên CẢ chuỗi (MA200 ngày vẫn có giá trị ở đầu cửa sổ 180 nến)
    ma: Object.fromEntries(CV_TIMEFRAMES.map((tf) => {
      const closes = series[tf].map((b) => b.close), k = TF[tf].sketchBars;
      return [tf, Object.fromEntries(TF[tf].ma.map((n) => [n, sma(closes, n).slice(-k).map(r2)]))];
    })),
  };
}

// ------------------------------------------------------------------ bộ lọc chứa mã

export const SCREENER_LABEL = Object.freeze({ camslim: "CAN SLIM", "base-breakout": "Base Breakout", convergence: "Hợp lưu v2", sepa: "SEPA", patterns: "Mô hình giá (Pring)" });

/** Chỉ mục mã -> các bộ lọc chứa mã (từ các doc KV strategies:<id>). Bỏ dòng LOẠI của SEPA. */
export function screenerIndex(docs) {
  const map = new Map();
  for (const [strategy, doc] of Object.entries(docs)) {
    for (const r of doc?.results ?? []) {
      if (strategy === "sepa" && r.list === "LOẠI") continue;
      const hit = {
        strategy, label: SCREENER_LABEL[strategy] ?? strategy,
        status: strategy === "sepa" ? r.list : strategy === "patterns" ? `${r.patterns?.[0]?.label ?? r.type} · ${r.patterns?.[0]?.stateLabel ?? r.status}` : r.status ?? null,
        grade: r.grade ?? null, side: r.side ?? null, score: r.metrics?.score ?? r.score ?? null, date: r.date ?? doc.dataAsOf ?? null,
        engine: doc.engine ?? null, evidence: doc.evidence?.label ?? null,
      };
      if (!map.has(r.ticker)) map.set(r.ticker, []);
      map.get(r.ticker).push(hit);
    }
  }
  return map;
}
