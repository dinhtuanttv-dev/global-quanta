// Chiến lược ngắn hạn & trung hạn theo ngành ICB Việt Nam (S1, 2026-10-17) — hàm thuần, có test. Ghép dữ liệu chuẩn của
// Nhịp đập thị trường (ngành thế giới → ngành VN), Nhịp đập hàng hoá (hàng hoá dẫn dắt) và Truyền dẫn & bằng chứng (engine world).
//
// NGẮN HẠN (phiên VN kế tiếp) — Grinold–Kahn: α = IC · σ · z.
//   z: điểm ngắn hạn S của ngành trừ trung bình các ngành (đúng phép thử H3), chuẩn hoá cắt ngang về độ lệch chuẩn 1.
//   σ: độ lệch chuẩn lợi suất TƯƠNG ĐỐI ngày (ngành − VN-Index), 250 phiên.
//   IC: CHỈ dùng IC đã qua kiểm định đặt trước (WS-v1: xếp hạng ngắn hạn IC 0,0203). Ngành có IC riêng đã đạt (Dầu khí 0,182) được
//       co về IC danh sách theo trọng số n/(n+n0) với n0 = n (tiền nghiệm mạnh bằng mẫu) -> 0,5·IC_ngành + 0,5·IC_danh sách.
//   P(vượt VN-Index) ≈ Φ(α/σ) (sai số dự báo ≈ σ·√(1−IC²) ≈ σ).
// TRUNG HẠN (1–3 tháng) — KHÔNG có tín hiệu đạt kiểm định (WS H4, W3 0/12, Lọc ngành L3 đều không đạt) -> KHÔNG dự báo (α = 0);
//   chỉ trình bày BỐI CẢNH: điểm 3 tháng ngành thế giới, chu kỳ RRG Lọc ngành, áp lực yếu tố truyền dẫn (liên kết bậc A/B ×
//   z yếu tố hiện tại), kịch bản. Nhãn bối cảnh = đồng thuận của các nguồn, gắn THĂM DÒ.

export const STRATEGY_VERSION = "S1 (2026-10-17)";
const ROUND = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const std = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

/** σ (log) của lợi suất tương đối ngày ngành − VN-Index, 250 phiên chung gần nhất. */
export function relativeVol(sectorPts, vnPts, window = 250) {
  const lr = (pts) => { const m = new Map(); for (let i = 1; i < pts.length; i++) if (pts[i - 1][1] > 0 && pts[i][1] > 0) m.set(pts[i][0], Math.log(pts[i][1] / pts[i - 1][1])); return m; };
  const s = lr(sectorPts), v = lr(vnPts);
  const rel = [...s.keys()].filter((d) => v.has(d)).sort().slice(-window).map((d) => s.get(d) - v.get(d));
  return rel.length >= 60 ? std(rel) : null;
}

/** IC dùng cho ngành: IC riêng đã đạt (co về IC danh sách) hoặc IC danh sách; danh sách không đạt -> 0. */
export function icFor(icb, ev) {
  if (!ev?.shortList?.pass) return { ic: 0, basisVi: "Xếp hạng ngắn hạn chưa đạt kiểm định — không dự báo." };
  const s = ev.sectors?.[icb];
  if (s?.pass) return { ic: ROUND(0.5 * s.ic + 0.5 * ev.shortList.ic, 4), basisVi: `IC ngành ${s.ic} (đạt) co về IC danh sách ${ev.shortList.ic}: 0,5·${s.ic} + 0,5·${ev.shortList.ic}.` };
  return { ic: ev.shortList.ic, basisVi: `IC xếp hạng danh sách ${ev.shortList.ic} (WS-v1).` };
}

const STANCE_SHORT = (z) => (z == null ? "na" : z >= 1 ? "overweight" : z <= -1 ? "underweight" : "neutral");

/**
 * Ngắn hạn. rows: dòng /api/world-sectors/scores; series: { [icb]: points }; vnIndex: points; ev: WS_EVIDENCE.
 */
export function shortTermStrategy(rows, series, vnIndex, ev) {
  const live = rows.filter((r) => r.available && r.short?.score != null);
  const m = mean(live.map((r) => r.short.score));
  const dem = live.map((r) => r.short.score - m);
  const sd = std(dem);
  const out = live.map((r, i) => {
    const z = sd > 0 ? dem[i] / sd : 0;
    const sigma = relativeVol(series[r.icb] ?? [], vnIndex);
    const { ic, basisVi } = icFor(r.icb, ev);
    const alpha = sigma != null ? ic * sigma * z : null; // log-lợi suất tương đối kỳ vọng / phiên
    return {
      icb: r.icb, nameVi: r.nameVi, parent: r.parent ?? null, score: r.short.score, zx: ROUND(z, 3), stance: STANCE_SHORT(z),
      ic, icBasisVi: basisVi, sigmaBps: sigma != null ? ROUND(sigma * 1e4, 1) : null,
      alphaBps: alpha != null ? ROUND(alpha * 1e4, 2) : null,
      pOutperform: alpha != null && sigma > 0 ? ROUND(normCdf(alpha / sigma), 4) : null,
      evidence: r.short.evidence ?? null, byRegion: r.short.sectors?.byRegion ?? {}, commodity: r.short.commodity ?? null,
      constituents: (r.constituents ?? []).slice(0, 5),
    };
  }).sort((a, b) => (b.alphaBps ?? -1e9) - (a.alphaBps ?? -1e9));
  return { n: out.length, crossMean: ROUND(m, 3), crossSd: ROUND(sd, 3), rows: out };
}

/** Rổ thế giới (engine Truyền dẫn) -> ICB (cùng bảng của Gateway world/worldData.SECTOR_ICB). */
export const BASKET_ICB = { S_BANK: "8300", S_SEC: "8700", S_RE: "8600", S_STEEL: "1750", S_OIL: "0500", S_PORT: "2770", S_TECH: "9500", S_POWER: "7530" };
const ICB_BASKET = Object.fromEntries(Object.entries(BASKET_ICB).map(([k, v]) => [v, k]));

/**
 * Áp lực yếu tố truyền dẫn: Σ sign(β)·z_yếu tố trên các liên kết bậc A/B (ma trận thăm dò) của rổ tương ứng. z_yếu tố = độ lệch chuẩn
 * của biến động tháng gần nhất (overview.pulse). Mô tả — không phải dự báo.
 */
export function factorPressure(cells, pulse, basket) {
  const z = new Map((pulse ?? []).map((p) => [p.id, p.z]));
  const links = (cells ?? []).filter((c) => c.sector === basket && (c.tier === "A" || c.tier === "B"));
  const parts = links.map((c) => ({ factor: c.factor, tier: c.tier, beta: c.beta, lag: c.lag, z: z.get(c.factor) ?? null, push: z.get(c.factor) != null ? ROUND(Math.sign(c.beta) * z.get(c.factor), 3) : null }));
  const pushes = parts.map((p) => p.push).filter((x) => x != null);
  return { score: pushes.length ? ROUND(mean(pushes), 3) : null, links: parts };
}

const RRG_SIGN = { LEADING: 1, IMPROVING: 1, WEAKENING: -1, LAGGING: -1 };

/**
 * Trung hạn (bối cảnh). rrg: { [icb]: sector doc /sectors/rrg }, world: { cells, pulse, confirm: rows, scenarios: [{id, nameVi, sectors:[{id, estPct, conclusive}]}] }.
 */
export function mediumTermContext(rows, rrg, world) {
  return rows.filter((r) => r.available).map((r) => {
    const g = rrg?.[r.icb] ?? null;
    const basket = ICB_BASKET[r.icb] ?? null;
    const fp = basket ? factorPressure(world?.cells, world?.pulse, basket) : { score: null, links: [] };
    const confirm = basket ? (world?.confirm ?? []).filter((x) => x.sector === basket).map((x) => ({ id: x.id, factor: x.factor, confirmed: x.confirmed, signOk: x.signOk, q: x.q })) : [];
    // kịch bản (engine Truyền dẫn, local projection tháng): |ước tính| > 50% / 3 tháng là bất ổn về số -> gắn cờ, không dùng bỏ phiếu
    const scen = basket ? (world?.scenarios ?? []).map((s) => {
      const x = s.sectors?.find((y) => y.sector === basket);
      if (!x) return null;
      const unreliable = !Number.isFinite(x.est) || Math.abs(x.est) > 50;
      return { id: s.id, nameVi: s.nameVi, estPct: ROUND(x.est, 2), lo: ROUND(x.lo, 2), hi: ROUND(x.hi, 2), conclusive: !!x.conclusive && !unreliable, unreliable };
    }).filter(Boolean) : [];
    const votes = [
      r.medium?.label === "tailwind" ? 1 : r.medium?.label === "headwind" ? -1 : 0,
      g ? RRG_SIGN[g.liveQuadrant ?? g.quadrant] ?? 0 : 0,
      fp.score == null ? 0 : fp.score >= 0.5 ? 1 : fp.score <= -0.5 ? -1 : 0,
    ];
    const pos = votes.filter((v) => v > 0).length, neg = votes.filter((v) => v < 0).length;
    const stance = pos >= 2 && neg === 0 ? "supportive" : neg >= 2 && pos === 0 ? "adverse" : pos || neg ? "mixed" : "neutral";
    return {
      icb: r.icb, nameVi: r.nameVi, parent: r.parent ?? null, stance, votes,
      ws: { score: r.medium?.score ?? null, label: r.medium?.label ?? "na", gap3m: r.medium?.gap3m ?? null, commodity: r.medium?.commodity ?? null, m1: r.medium?.m1?.score ?? null },
      rrg: g ? { quadrant: g.liveQuadrant ?? g.quadrant, state: g.state?.label ?? null, accumulation: g.flow?.money?.accumulationScore ?? null, foreignNet20: g.flow?.money?.foreignNet20 ?? null, weeksSinceImproving: g.weeksSinceImproving ?? null } : null,
      basket, factorPressure: fp, confirm, scenarios: scen,
      constituents: (r.constituents ?? []).slice(0, 5),
    };
  }).sort((a, b) => ({ supportive: 0, mixed: 1, neutral: 2, adverse: 3 }[a.stance] - { supportive: 0, mixed: 1, neutral: 2, adverse: 3 }[b.stance]) || (b.ws.score ?? 0) - (a.ws.score ?? 0));
}

/** Bối cảnh rủi ro toàn cầu (mô tả): VIX mức & biến động phiên, DXY, US10Y — Risk-On đã KHÔNG đạt kiểm định nên không dùng để chỉnh α. */
export function riskRegime(pulseMacro) {
  const q = pulseMacro?.quotes ?? {};
  const vix = q.vix?.value ?? null, vixChg = q.vix?.changePct ?? null;
  const stressed = (vix != null && vix >= 20) || (vixChg != null && vixChg >= 15);
  return {
    stressed, vix, vixChg: ROUND(vixChg, 2), dxy: q.dxy?.value ?? null, dxyChg: ROUND(q.dxy?.changePct, 2), us10y: q.treasury_10y?.value ?? null, date: q.vix?.date ?? null,
      noteVi: stressed
      ? "Biến động thế giới cao (VIX ≥ 20 hoặc tăng ≥ 15% trong phiên): biên độ thực tế rộng hơn σ lịch sử — lợi thế xếp hạng nhỏ dễ bị nhiễu lấn át."
      : "Biến động thế giới bình thường.",
  };
}

// ── S2: sổ theo dõi tiến (forward ledger) ──────────────────────────────────────────────────────────────────────────────
// Mỗi phiên VN d ghi z ngắn hạn của các ngành; bản ghi được cập nhật cho tới 09:00 giờ VN (02:00Z) của ngày làm việc kế tiếp rồi
// KHOÁ cứng — không dùng thông tin trong phiên dự báo. Đánh giá: IC Spearman cắt ngang giữa z(d) và lợi suất tương đối của phiên
// VN kế tiếp; danh mục "nhóm đầu − nhóm cuối" (1/3 trên − 1/3 dưới, cân bằng) cộng dồn.
export const LEDGER_MAX = 600;

/** 02:00Z của ngày làm việc (T2–T6) đầu tiên sau ngày d. */
export function nextOpenMs(d) {
  const t = new Date(`${d}T02:00:00Z`);
  do t.setUTCDate(t.getUTCDate() + 1); while ([0, 6].includes(t.getUTCDay()));
  return t.getTime();
}

/** Ghi / khoá bản ghi cho phiên `date`. Trả ledger mới (không đổi đầu vào). */
export function updateLedger(ledger, date, rows, nowMs) {
  const list = (ledger ?? []).map((e) => ({ ...e }));
  for (const e of list) if (!e.frozen && nowMs >= nextOpenMs(e.date)) e.frozen = true;
  if (!date || nowMs >= nextOpenMs(date)) return list.slice(-LEDGER_MAX);
  const z = Object.fromEntries(rows.filter((r) => r.zx != null).map((r) => [r.icb, r.zx]));
  if (Object.keys(z).length < 10) return list.slice(-LEDGER_MAX);
  const entry = { date, recordedAt: new Date(nowMs).toISOString(), frozen: false, z };
  const i = list.findIndex((e) => e.date === date);
  if (i >= 0) { if (!list[i].frozen) list[i] = entry; } else list.push(entry);
  return list.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-LEDGER_MAX);
}

const rank = (xs) => { const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); for (let k = 0; k < idx.length;) { let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++; const a = (k + j) / 2 + 1; for (let t = k; t <= j; t++) r[idx[t][1]] = a; k = j + 1; } return r; };
function spearmanIc(x, y) { const n = x.length; if (n < 5) return null; const rx = rank(x), ry = rank(y), m = (n + 1) / 2; let c = 0, vx = 0, vy = 0; for (let i = 0; i < n; i++) { c += (rx[i] - m) * (ry[i] - m); vx += (rx[i] - m) ** 2; vy += (ry[i] - m) ** 2; } return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null; }
function nw(xs, L = 5) { const n = xs.length; if (n < 5) return { mean: n ? mean(xs) : null, t: null, p: null }; const m = mean(xs), e = xs.map((x) => x - m); let v = e.reduce((a, x) => a + x * x, 0) / n; for (let l = 1; l <= L; l++) { let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * (1 - l / (L + 1)) * (g / n); } const t = m / Math.sqrt(Math.max(v, 1e-18) / n); return { mean: m, t, p: 1 - normCdf(t) }; }

/** Đánh giá sổ: chỉ bản ghi ĐÃ KHOÁ và đã có phiên VN kế tiếp. series: { icb: points }, vnIndex: points. */
export function evaluateLedger(ledger, series, vnIndex) {
  const lvl = (pts) => new Map(pts.map((p) => [p[0], p[1]]));
  const V = lvl(vnIndex), S = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, lvl(v)]));
  const vDates = vnIndex.map((p) => p[0]);
  const days = [];
  for (const e of (ledger ?? []).filter((x) => x.frozen)) {
    const i = vDates.indexOf(e.date);
    if (i < 0 || i + 1 >= vDates.length) continue;
    const d1 = vDates[i + 1];
    const vr = Math.log(V.get(d1) / V.get(e.date));
    const xs = [], ys = [];
    for (const [icb, z] of Object.entries(e.z)) {
      const a = S[icb]?.get(e.date), b = S[icb]?.get(d1);
      if (a > 0 && b > 0) { xs.push(z); ys.push(Math.log(b / a) - vr); }
    }
    if (xs.length < 10) continue;
    const ic = spearmanIc(xs, ys);
    const order = xs.map((z, k) => [z, ys[k]]).sort((a, b) => b[0] - a[0]);
    const k3 = Math.max(1, Math.floor(order.length / 3));
    const spread = mean(order.slice(0, k3).map((x) => x[1])) - mean(order.slice(-k3).map((x) => x[1]));
    days.push({ date: e.date, next: d1, ic: ROUND(ic, 4), spreadPct: ROUND(spread * 100, 4), n: xs.length });
  }
  const ics = days.map((d) => d.ic).filter((x) => x != null);
  const st = nw(ics);
  let cum = 0;
  const curve = days.map((d) => [d.next, ROUND((cum += d.spreadPct / 100) * 100, 4)]);
  return {
    since: ledger?.[0]?.date ?? null, recorded: (ledger ?? []).length, evaluated: days.length,
    meanIc: ROUND(st.mean, 4), t: ROUND(st.t, 2), p: ROUND(st.p, 4),
    hitRate: days.length ? ROUND(days.filter((d) => d.spreadPct > 0).length / days.length, 4) : null,
    cumSpreadPct: curve.length ? curve.at(-1)[1] : null, curve, days: days.slice(-60),
    statusVi: days.length < 60 ? `Đang tích luỹ mẫu: ${days.length}/60 phiên đã chấm — chưa đủ để kết luận.` : st.mean > 0 && st.p < 0.05 ? "Theo dõi tiến: IC dương có ý nghĩa." : "Theo dõi tiến: chưa thấy IC dương có ý nghĩa.",
  };
}
