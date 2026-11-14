// HL-v1 (12/11/2026) — HỢP LƯU ĐA YẾU TỐ theo quy tắc của chủ dự án + SỔ THEO DÕI TIẾN (HL-L1).
//  • hlScores: bản máy chủ của src/lib/elite10/confluence.ts (cùng quy tắc, có test đối chiếu từng mã ở giao diện).
//      Tầng 1: LS-v1 top 20% + ≥ 2/7 mô hình TA · Tầng 2: RRG ngành (Cải thiện / Dẫn dắt ủng hộ; Suy yếu / Tụt hậu phản đối)
//      · Tầng 3: tích điểm +1 / −1 các tab. Xếp hạng: đạt tầng 1 -> điểm tầng 1 -> tầng 2 -> tầng 3.
//  • Sổ HL-L1: mỗi phiên ghi danh sách các nhóm theo bảng tín hiệu E1 của phiên đó (point-in-time, không sửa về sau); khi đủ giá thì
//    chấm lợi suất 20 phiên (vào đóng cửa d+1, ra đóng cửa d+21) so với bình quân đều cả bảng. Nhãn THĂM DÒ — không có kiểm định đăng
//    ký trước; không đổi Điểm Elite / Danh mục Elite 10.
import fs from "node:fs";
import path from "node:path";

export const HL_VERSION = "HL-v1 (12/11/2026)";
export const HL_RULES = Object.freeze({ lsLeaderPct: 80, taMin: 2, strongT3: 2 });
/** Sổ tiến: bắt đầu ở phiên quy tắc được đưa lên (không chấm ngược về trước). */
export const HL_LEDGER = Object.freeze({ start: "2026-11-12", horizon: 20, entryLag: 1, limitUpSkip: 0.067, minDays: 120, minLs: 100 });
export const HL_GROUPS = Object.freeze({
  sel: "Hợp lưu (tầng 1 + RRG ủng hộ)", strong: "Hợp lưu mạnh (thêm tầng 3 ≥ +2)", pass1: "Đạt tầng 1 (mọi ngành)",
  lead: "Tầng 1 + ngành Dẫn dắt", impr: "Tầng 1 + ngành Cải thiện", against: "Tầng 1 + ngành phản đối",
});

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const r6 = (x) => (fin(x) ? Math.round(x * 1e6) / 1e6 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Phân vị hạng giữa (0–100) của từng mã cho một tín hiệu. */
export function midPercentiles(rows, sig) {
  const list = rows.map((r) => [r.ticker, r.values?.[sig]]).filter((x) => fin(x[1]));
  const sorted = list.map((x) => x[1]).sort((a, b) => a - b), out = new Map();
  for (const [t, v] of list) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let eq = lo; while (eq < sorted.length && sorted[eq] === v) eq++;
    out.set(t, ((lo + (eq - lo) / 2) / sorted.length) * 100);
  }
  return out;
}

const TA_MODELS = [
  ["sepa_state", (v) => v >= 1], ["base_breakout", (v) => v >= 2], ["convergence", (v) => v >= 2], ["pattern_state", (v) => v >= 0.5],
  ["structure_score", (v) => v >= 6], ["structure_stage", (v) => v === 2], ["structure_verdict", (v) => v === 2],
];
/** Thứ tự phiếu tầng 3 — trùng thứ tự mảng `f` trong hlScores. */
export const VOTE_IDS = Object.freeze(["stealth20", "stealth5", "net_intent", "foreign_net_buy", "fa_score", "ws_sector_alpha", "top20_alpha", "catalyst_impact", "cotuc_decision"]);
/** Số mô hình TA của tầng 1 — xuất cho giao diện để không gõ cứng "/7". */
export const HL_TA_MODEL_COUNT = TA_MODELS.length;
const lsPoints = (pct) => (pct == null ? 0 : pct >= 80 ? 5 : pct >= 60 ? 3 : pct >= 40 ? 1 : 0);
const sign = (v, up, down) => (fin(v) ? (up(v) ? 1 : down(v) ? -1 : 0) : null);

export function hlCompare(a, b) {
  return Number(b.pass1) - Number(a.pass1) || b.t1 - a.t1 || b.t2 - a.t2 || b.t3 - a.t3 || (b.lsPct ?? -1) - (a.lsPct ?? -1) || a.ticker.localeCompare(b.ticker);
}

/** Điểm HL-v1 cho mọi mã của bảng tín hiệu -> mảng đã xếp hạng. */
export function hlScores(rows) {
  const lsP = midPercentiles(rows, "ls_v1"), topP = midPercentiles(rows, "top20_alpha");
  const list = rows.map((r) => {
    const v = r.values ?? {};
    const lsPct = lsP.get(r.ticker) ?? null, lsPts = lsPoints(lsPct);
    // N2: từng điều kiện tầng 1 (true / false / null = chưa có dữ liệu) và từng phiếu tầng 3 — để giải trình "Vì sao".
    const ta = Object.fromEntries(TA_MODELS.map(([sig, ok]) => [sig, fin(v[sig]) ? ok(v[sig]) : null]));
    const taCount = TA_MODELS.filter(([sig, ok]) => fin(v[sig]) && ok(v[sig])).length, taPts = Math.min(5, taCount);
    const pass1 = lsPct != null && lsPct >= HL_RULES.lsLeaderPct && taCount >= HL_RULES.taMin;
    const rrg = fin(v.rrg_quadrant) ? v.rrg_quadrant : null;
    const t2 = rrg == null ? 0 : rrg >= 1 ? 1 : rrg <= -1 ? -1 : 0;
    const tp = topP.get(r.ticker);
    const f = [
      sign(v.stealth20, (x) => x >= 1, (x) => x <= -1.5), sign(v.stealth5, (x) => x >= 1.5, () => false),
      sign(v.net_intent, (x) => x >= 0.5, (x) => x <= -0.5), sign(v.foreign_net_buy, (x) => x === 1, () => false),
      sign(v.fa_score, (x) => x >= 60, (x) => x <= 30), sign(v.ws_sector_alpha, (x) => x > 0, (x) => x < 0),
      tp == null ? null : tp >= 70 ? 1 : tp <= 30 ? -1 : 0,
      sign(v.catalyst_impact, (x) => x >= 1, (x) => x <= -1), sign(v.cotuc_decision, (x) => x === 1, (x) => x === -1),
    ];
    const t3 = f.reduce((a, x) => a + (x ?? 0), 0);
    const votes = Object.fromEntries(VOTE_IDS.map((id, i) => [id, f[i]]));
    const cls = !pass1 ? "NOT_T1" : t2 > 0 ? (t3 >= HL_RULES.strongT3 ? "STRONG" : "CONFLUENCE") : t2 < 0 ? "T1_SECTOR_AGAINST" : "T1_SECTOR_NA";
    return { ticker: r.ticker, lsPct, lsPts, taCount, taPts, t1: lsPts + taPts, pass1, rrg, t2, t3, cls, rank: 0, ta, votes };
  });
  list.sort(hlCompare).forEach((x, i) => { x.rank = i + 1; });
  return list;
}

/** Các nhóm ghi sổ của một phiên (mã theo thứ tự xếp hạng). */
export function hlGroups(scores) {
  const pick = (f) => scores.filter(f).map((x) => x.ticker);
  const sel = (x) => x.cls === "STRONG" || x.cls === "CONFLUENCE";
  return {
    sel: pick(sel), strong: pick((x) => x.cls === "STRONG"), pass1: pick((x) => x.pass1),
    lead: pick((x) => sel(x) && x.rrg === 2), impr: pick((x) => sel(x) && x.rrg === 1), against: pick((x) => x.cls === "T1_SECTOR_AGAINST"),
  };
}

/**
 * Chấm một phiên: fwd = { mã: lợi suất vào đóng cửa d+1 -> ra đóng cửa d+21 } (chỉ mã mua được: không tăng sát trần ở phiên vào).
 * Vượt trội = bình quân nhóm − bình quân đều cả bảng.
 */
export function scoreEntry(groups, all, fwd) {
  const uni = all.map((t) => fwd[t]).filter(fin), u = mean(uni);
  if (u == null) return null;
  const g = {};
  for (const [k, list] of Object.entries(groups)) { const xs = list.map((t) => fwd[t]).filter(fin), m = mean(xs); g[k] = { n: xs.length, mean: r6(m), ex: m == null ? null : r6(m - u) }; }
  return { uniN: uni.length, uni: r6(u), g };
}

/** t của trung bình trên chuỗi KHÔNG chồng lấn (mỗi `step` phiên lấy một), trung vị qua mọi pha lấy mẫu. */
export function nonOverlapT(xs, step) {
  const ts = [];
  for (let p = 0; p < step; p++) {
    const s = xs.filter((_, i) => i % step === p).filter(fin); if (s.length < 3) continue;
    const m = mean(s), sd = Math.sqrt(s.reduce((a, x) => a + (x - m) ** 2, 0) / (s.length - 1));
    if (sd > 0) ts.push(m / (sd / Math.sqrt(s.length)));
  }
  if (!ts.length) return null;
  ts.sort((a, b) => a - b); const h = ts.length >> 1;
  return Math.round((ts.length % 2 ? ts[h] : (ts[h - 1] + ts[h]) / 2) * 100) / 100;
}

/** Tổng hợp sổ theo nhóm. Trước `minDays` phiên đã chấm: CHƯA ĐỦ MẪU. */
export function summarizeHl(entries, cfg = HL_LEDGER) {
  const scored = entries.filter((e) => e.score);
  const groups = {};
  for (const k of Object.keys(HL_GROUPS)) {
    const ex = scored.map((e) => e.score.g[k]?.ex ?? null), has = ex.filter(fin);
    const m = mean(has), t = nonOverlapT(ex, cfg.horizon);
    groups[k] = {
      labelVi: HL_GROUPS[k], days: has.length, avgSize: r6(mean(entries.map((e) => e.groups[k]?.length ?? 0))),
      meanEx: r6(m), posShare: has.length ? r6(has.filter((x) => x > 0).length / has.length) : null, t,
      verdict: has.length < cfg.minDays ? "CHƯA ĐỦ MẪU" : m > 0 && t != null && t >= 2 ? "DƯƠNG, CÓ Ý NGHĨA" : m < 0 && t != null && t <= -2 ? "ÂM, CÓ Ý NGHĨA" : "CHƯA CÓ Ý NGHĨA",
    };
  }
  return { days: entries.length, scoredDays: scored.length, from: entries[0]?.d ?? null, to: entries.at(-1)?.d ?? null, groups, label: "THĂM DÒ" };
}

// ---------------------------------------------------------------- dịch vụ
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const writeJson = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); };

/**
 * @param deps.getKv(key) -> giá trị KV; deps.panelIndexKey / deps.panelKey(date) -> bảng tín hiệu E1;
 * @param deps.pricesOf(t) -> [[ngày, giáĐiềuChỉnh, …]] (kho giá Gateway).
 */
export function createHlLedger({ dir, getKv, panelIndexKey, panelKey, pricesOf, now = Date.now, cfg = HL_LEDGER }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "elite-hl-ledger.json");
  const load = () => readJson(file) ?? { version: HL_VERSION, start: cfg.start, entries: [] };
  let running = false;

  async function tick() {
    if (running) return { running: true };
    running = true;
    try {
      const S = load(); const have = new Set(S.entries.map((e) => e.d));
      const idx = (await getKv(panelIndexKey))?.dates ?? [];
      let added = 0, skipped = 0, scored = 0;
      for (const d of idx) {
        if (d < cfg.start || have.has(d)) continue;
        const doc = await getKv(panelKey(d)); const rows = doc?.rows ?? [];
        // Thiếu LS-v1 (tầng 1 không tính được) -> không ghi phiên đó, lần sau thử lại; không ghi sổ rỗng giả.
        if (rows.filter((r) => fin(r.values?.ls_v1)).length < cfg.minLs) { skipped++; continue; }
        S.entries.push({ d, n: rows.length, groups: hlGroups(hlScores(rows)), all: rows.map((r) => r.ticker), score: null }); added++;
      }
      S.entries.sort((a, b) => a.d.localeCompare(b.d));
      const dates = (pricesOf("VNINDEX") ?? []).map((r) => r[0]); const at = new Map(dates.map((x, i) => [x, i]));
      const px = new Map(); const adj = (t) => { if (!px.has(t)) px.set(t, new Map((pricesOf(t) ?? []).map((r) => [r[0], r[1]]))); return px.get(t); };
      for (const e of S.entries) {
        if (e.score) continue;
        const i = at.get(e.d); if (i == null || i + cfg.entryLag + cfg.horizon >= dates.length) continue;
        const d0 = dates[i], d1 = dates[i + cfg.entryLag], d2 = dates[i + cfg.entryLag + cfg.horizon], fwd = {};
        for (const t of e.all) { const m = adj(t), a = m.get(d0), b = m.get(d1), c = m.get(d2); if (a > 0 && b > 0 && c > 0 && b / a - 1 < cfg.limitUpSkip) fwd[t] = c / b - 1; }
        const sc = scoreEntry(e.groups, e.all, fwd); if (!sc) continue;
        e.score = { entry: d1, exit: d2, ...sc }; scored++;
      }
      S.updatedAt = new Date(now()).toISOString();
      writeJson(file, S);
      return { added, skipped, scored, days: S.entries.length };
    } finally { running = false; }
  }

  function summary() {
    const S = load(); const last = S.entries.at(-1) ?? null;
    return {
      version: HL_VERSION, rule: cfg, start: S.start, updatedAt: S.updatedAt ?? null, ...summarizeHl(S.entries, cfg),
      latest: last ? { d: last.d, n: last.n, groups: last.groups } : null,
      recent: S.entries.slice(-30).reverse().map((e) => ({ d: e.d, size: Object.fromEntries(Object.entries(e.groups).map(([k, v]) => [k, v.length])), score: e.score ? { exit: e.score.exit, uni: e.score.uni, ex: Object.fromEntries(Object.entries(e.score.g).map(([k, v]) => [k, v.ex])) } : null })),
      noteVi: "Sổ theo dõi tiến của quy tắc HL-v1 — THĂM DÒ, không có kiểm định đăng ký trước. Mỗi phiên ghi danh sách theo bảng tín hiệu của đúng phiên đó; chấm sau 20 phiên (vào đóng cửa phiên kế tiếp, bỏ mã tăng sát trần ở phiên vào), so với bình quân đều cả bảng, chưa trừ phí. Thống kê t tính trên chuỗi không chồng lấn. Mô tả, không phải khuyến nghị.",
    };
  }
  return { tick, summary, status: () => ({ version: HL_VERSION, running }) };
}
