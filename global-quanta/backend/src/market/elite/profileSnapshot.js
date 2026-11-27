// HS360-v3 H3 (27/11/2026, docs/ho-so-360-v3/04) — ẢNH CHỤP HỒ SƠ MỘT MÃ: GET /api/elite/profile/:ticker.
// Ghép các dịch vụ ĐÃ CÓ trên Gateway (bảng tín hiệu E1, quyết định Elite HL, bằng chứng E2, tiến hoá EV-4, sổ bằng chứng ER-v1 /
// IMPACT_EVIDENCE, hồ sơ PFA, sổ phán quyết AI ARL-v1, giá điều chỉnh) thành MỘT tài liệu cho Hồ sơ 360°, khoá theo phiên.
// CHỈ ĐỌC: không tính lại engine nào, không đổi quy tắc / bậc / trọng số. Dấu bằng chứng chép từ sổ, không suy diễn. Câu chữ dựng từ mẫu cố định
// (không AI, không lời khuyên — xem FORBIDDEN_WORDS). Một nguồn lỗi -> phần đó null + tên nguồn trong `missing`, tài liệu vẫn trả.
import { hlScores, HL_TA_MODEL_COUNT } from "./confluence.js";
import { SPEC_BY_ID } from "./signalRegistry.js";

export const PROFILE_VERSION = "HS360-v3 (27/11/2026)";
export const PRICE_BARS = 90;
/** Từ không được xuất hiện trong câu do code dựng (kiểm bằng kiểm thử). */
export const FORBIDDEN_WORDS = Object.freeze(["mua ngay", "nên mua", "nên bán", "bán ngay", "chắc chắn", "tối ưu", "khuyến nghị mua", "khuyến nghị bán"]);

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const nf = (v, d = 1) => (fin(v) ? v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const sgn = (v, d = 1) => (fin(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}` : "—");
const TIER_SEAL = { A: "ĐẠT", B: "MỘT PHẦN", C: "THĂM DÒ" };
const SEAL_RANK = { "ĐẠT": 0, "MỘT PHẦN": 1, "THĂM DÒ": 2, "ĐANG TÍCH LUỸ": 3, "MÔ TẢ": 4, "CHƯA KIỂM ĐỊNH": 5, "KHÔNG ĐẠT": 6 };
const RRG_VI = { 2: "Dẫn dắt", 1: "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const PZ_VI = { BUY_ZONE: "trong vùng mua", IN_BASE: "trong nền", HOT: "tăng nóng", EXTENDED: "đã chạy xa", NO_BASE: "chưa có nền", COOLING: "đang hạ nhiệt" };
const LANE_VI = { CORE: "Lõi", RUNNER: "Chạy lãi", WAIT: "Chờ nền" };
/** Nguồn của bảng E1 mà tín hiệu phụ thuộc — lý do ô trống (giữ đồng bộ với giao diện SignalTableView). */
const SOURCE_OF = {
  stealth20: "researchFeatures", stealth5: "researchFeatures", net_intent: "researchFeatures", mom5_atr: "researchFeatures", log_rvol: "researchFeatures",
  camslim_cup: "strategies:camslim", kq_nowcast: "kqkd", top20_alpha: "top20", ws_sector_alpha: "worldStrategy", rrg_quadrant: "rrg",
  catalyst_impact: "catalyst", cotuc_decision: "cotuc", ls_v1: "leadership", structure_score: "structure", structure_verdict: "structure",
  sepa_s2: "strategies:sepa", sepa_state: "strategies:sepa", pattern_state: "strategies:patterns", convergence: "strategies:convergence", base_breakout: "strategies:base-breakout",
};

/** Phân vị (0–100), hạng trung bình cho giá trị trùng. */
export function percentileOf(values, v) {
  if (!fin(v) || !values.length) return null;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

function hlPosition(decision, ticker) {
  const hl = decision?.hl;
  if (!hl) return null;
  const pick = (decision.portfolio ?? []).find((p) => p.ticker === ticker && p.hl) ?? null;
  if (pick) {
    return { held: true, rank: pick.hl.rank ?? null, cls: pick.hl.cls ?? null, weight: r4(pick.weight), lane: pick.hl.pz?.lane ?? null, pzState: pick.hl.pz?.state ?? null,
      exitBufferLs: r4(pick.hl.exitBufferLs ?? null), taCount: pick.hl.taCount ?? null, rrg: pick.hl.rrg ?? null, queue: null, against: null };
  }
  const q = [...(hl.queue ?? []), ...(hl.queueIlliquid ?? [])].find((x) => x.ticker === ticker);
  const a = (hl.against ?? []).find((x) => x.ticker === ticker);
  return { held: false, rank: null, cls: null, weight: null, lane: null, pzState: null, exitBufferLs: null, taCount: null, rrg: null,
    queue: q ? { hlRank: q.hlRank, code: String(q.code), reasonVi: q.reasonVi } : null, against: a ? { rrgVi: a.rrgVi ?? null } : null };
}

/** Bảng tín hiệu E2 của mã (đặc tả 03 §2). */
export function profileSignals({ panel, row, evidence, evolution, contributions }) {
  const l2 = row?.icb?.l2 ?? null;
  const all = new Map(), sector = new Map();
  for (const r of panel?.rows ?? []) for (const [k, v] of Object.entries(r.values ?? {})) {
    if (!fin(v)) continue;
    (all.get(k) ?? all.set(k, []).get(k)).push(v);
    if (l2 && r.icb?.l2 === l2) (sector.get(k) ?? sector.set(k, []).get(k)).push(v);
  }
  const evOf = new Map((evidence?.signals ?? []).map((s) => [s.id, s]));
  const evoOf = new Map((evolution?.signals ?? []).map((s) => [s.id, s]));
  const regime = evolution?.currentRegime && evolution.currentRegime !== "UNKNOWN" ? evolution.currentRegime : null;
  const specs = panel?.signals ?? [];
  return specs.map((spec) => {
    const v = row?.values?.[spec.id];
    const value = fin(v) ? v : null;
    const e = evOf.get(spec.id), o = evoOf.get(spec.id);
    const sec = sector.get(spec.id) ?? [];
    const c = (contributions ?? []).find((x) => x.id === spec.id);
    const ri = regime && o?.regimeIc?.[regime] ? o.regimeIc[regime] : null;
    return {
      id: spec.id, tab: spec.tab, labelVi: spec.labelVi, unit: spec.unit, value,
      nullReason: value != null ? null : (panel?.missingSources ?? []).includes(SOURCE_OF[spec.id]) ? "SOURCE_MISSING" : "NO_DATA",
      pctUniverse: r4(percentileOf(all.get(spec.id) ?? [], value)), pctSector: sec.length >= 5 ? r4(percentileOf(sec, value)) : null,
      tier: e?.tier ?? spec.tier, change: e?.change ?? "none",
      sqs: o?.sqs ?? null, trendTag: o?.trendTag ?? null, icRegimeNow: ri ? { regime, n: ri.n, mean: ri.mean } : null,
      contribution: c && c.contribution !== 0 ? r4(c.contribution) : null,
    };
  });
}

const sealOfTier = (evidence, id) => TIER_SEAL[(evidence?.signals ?? []).find((s) => s.id === id)?.tier ?? SPEC_BY_ID.get(id)?.tier] ?? "CHƯA KIỂM ĐỊNH";
const regSeal = (registry, id) => (registry?.entries ?? []).find((e) => e.id === id)?.verdict ?? "CHƯA KIỂM ĐỊNH";
const impactSeal = (registry, id) => (registry?.impact ?? []).find((e) => e.id === id)?.seal ?? "CHƯA KIỂM ĐỊNH";
const dir = (v, up, down) => (fin(v) ? (up(v) ? 1 : down(v) ? -1 : 0) : null);

/** Ma trận Lớp × Bằng chứng (đặc tả 02 §4). Màu ở giao diện theo dấu bằng chứng, không theo chiều. */
export function profileLayers({ row, hlRow, pos, score, fa, ai, evidence, registry, panel, decision }) {
  const v = row?.values ?? {};
  const asOfPanel = panel?.date ?? null;
  const taCount = hlRow?.taCount ?? pos?.taCount ?? null;
  const camslim = v.camslim_cup;
  const warnN = (fa?.warnings ?? []).filter((w) => w.level === "warn").length;
  const aiEntries = ai?.entries ?? [];
  const aiScored = aiEntries.filter((e) => e.results && Object.keys(e.results).length).length;
  const liqTier = score?.liq?.tier ?? null;
  const flowMissing = (panel?.missingSources ?? []).includes("researchFeatures");
  return [
    { id: "LEADERSHIP", labelVi: "Dẫn dắt (LS-v1)", direction: dir(hlRow?.lsPct, (x) => x >= 80, (x) => x <= 40),
      stateVi: fin(hlRow?.lsPct) ? `LS-v1 phân vị ${nf(hlRow.lsPct, 0)}${fin(v.ls_v1) ? `, z ${sgn(v.ls_v1, 2)}` : ""}` : "chưa có điểm LS-v1 phiên này",
      seal: sealOfTier(evidence, "ls_v1"), sealSource: "E2 ls_v1 · LS-r1", asOf: asOfPanel },
    { id: "TECHNICAL", labelVi: "Kỹ thuật (7 mô hình TA · CAN SLIM)", direction: taCount == null ? null : taCount >= 2 ? 1 : taCount === 0 ? -1 : 0,
      stateVi: `${taCount ?? "—"}/${HL_TA_MODEL_COUNT} mô hình TA đạt${fin(camslim) ? ` · CAN SLIM ${camslim === 2 ? "phá vỡ pivot" : camslim === 1 ? "sẵn sàng" : "không có mẫu hình"}` : ""}`,
      seal: regSeal(registry, "HL"), sealSource: "ER-v1 HL-r2 (quy tắc Elite HL)", asOf: asOfPanel },
    { id: "SECTOR", labelVi: "Ngành (RRG)", direction: dir(v.rrg_quadrant, (x) => x >= 1, (x) => x <= -1),
      stateVi: fin(v.rrg_quadrant) ? `ngành ở góc ${RRG_VI[String(v.rrg_quadrant)] ?? v.rrg_quadrant}` : "chưa có RRG ngành",
      seal: sealOfTier(evidence, "rrg_quadrant"), sealSource: "E2 rrg_quadrant", asOf: asOfPanel },
    { id: "FLOW", labelVi: "Dòng tiền (Stealth, IFE)", direction: flowMissing ? null : dir(v.stealth20, (x) => x >= 1, (x) => x <= -1.5),
      stateVi: flowMissing ? "bảng tín hiệu phiên này thiếu dòng tiền" : fin(v.stealth20) ? `Stealth 20 = ${sgn(v.stealth20, 2)} z` : "không có dữ liệu cho mã",
      seal: sealOfTier(evidence, "stealth20"), sealSource: "E2 stealth20", asOf: asOfPanel },
    { id: "FUNDAMENTAL", labelVi: "Cơ bản & KQKD", direction: dir(v.kq_nowcast, (x) => x > 0.05, (x) => x < -0.05),
      stateVi: `${fin(v.kq_nowcast) ? `LNST cả năm ước ${sgn(v.kq_nowcast * 100, 1)}%` : "chưa có ước tính LNST cả năm"}${warnN ? ` · ${warnN} cảnh báo chất lượng số liệu` : ""}`,
      seal: sealOfTier(evidence, "kq_nowcast"), sealSource: "E2 kq_nowcast · KQ-r1", asOf: fa?.asOf ?? asOfPanel },
    { id: "WORLD_CATALYST", labelVi: "Thế giới & xúc tác", direction: dir(v.ws_sector_alpha, (x) => x > 0, (x) => x < 0),
      stateVi: `${fin(v.ws_sector_alpha) ? `α ngành thế giới ${sgn(v.ws_sector_alpha, 2)} đcb` : "chưa có α ngành thế giới"}${fin(v.catalyst_impact) && v.catalyst_impact !== 0 ? ` · xúc tác ${sgn(v.catalyst_impact, 0)}` : ""}`,
      seal: impactSeal(registry, "WS-v1"), sealSource: "IMPACT_EVIDENCE WS-v1", asOf: asOfPanel },
    { id: "TIMING", labelVi: "Vị trí giá & thời điểm", direction: pos?.pzState == null ? null : pos.pzState === "BUY_ZONE" ? 1 : pos.pzState === "HOT" || pos.pzState === "EXTENDED" ? -1 : 0,
      stateVi: pos?.pzState ? `giá ${PZ_VI[pos.pzState] ?? pos.pzState}${pos.lane ? ` · làn ${LANE_VI[pos.lane] ?? pos.lane}` : ""}` : "vị trí giá chỉ tính cho mã trong danh mục",
      seal: regSeal(registry, "PZ"), sealSource: "ER-v1 PZ-r2", asOf: decision?.date ?? null },
    { id: "LIQUIDITY", labelVi: "Thanh khoản", direction: liqTier == null ? null : liqTier === "L1" || liqTier === "L2" ? 1 : liqTier === "L4" ? -1 : 0,
      stateVi: liqTier ? `hạng ${liqTier}${fin(score?.advBn) ? ` · GTGD TB20 ${nf(score.advBn, 1)} tỷ` : ""}` : "chưa có số đo thanh khoản",
      seal: regSeal(registry, "LQ"), sealSource: "ER-v1 LQ-r1", asOf: decision?.date ?? null },
    { id: "AI", labelVi: "Phòng họp AI", direction: null,
      stateVi: aiEntries.length ? `${aiEntries.length} bản phân tích đã khoá · ${aiScored} bản đã chấm` : "chưa có bản phân tích khoá",
      seal: (ai?.summary?.label ?? "") === "CHƯA ĐỦ MẪU" || !aiScored ? "ĐANG TÍCH LUỸ" : "THĂM DÒ", sealSource: "ARL-v1", asOf: ai?.updatedAt ?? null },
  ];
}

/** Thẻ Luận điểm (02 §3): dựng bằng luật cố định từ lớp + quy tắc bán + cảnh báo; không AI, không lời khuyên. */
export function profileThesis({ layers, pos, decision, fa, signals, evolution }) {
  const strengths = layers.filter((l) => l.direction === 1 && (l.seal === "ĐẠT" || l.seal === "MỘT PHẦN"))
    .sort((a, b) => SEAL_RANK[a.seal] - SEAL_RANK[b.seal]).slice(0, 3)
    .map((l) => ({ layer: l.id, textVi: `${l.labelVi}: ${l.stateVi}`, seal: l.seal }));
  const R = decision?.hl?.rule ?? {};
  const risks = [];
  if (pos?.held) {
    const warnGap = (R.warnLsPct ?? 70) - (R.exitLsPct ?? 60);
    if (fin(pos.exitBufferLs) && pos.exitBufferLs < warnGap) risks.push({ kind: "EXIT_NEAR", textVi: `LS-v1 còn cách ngưỡng bán ${nf(pos.exitBufferLs, 0)} điểm (dưới mức cảnh báo ${R.warnLsPct ?? 70}).` });
    if (fin(pos.taCount) && pos.taCount <= (R.exitTaMin ?? 1)) risks.push({ kind: "EXIT_NEAR", textVi: `Chỉ còn ${pos.taCount} mô hình TA đạt — mất thêm 1 là chạm điều kiện bán.` });
    if (fin(pos.rrg) && pos.rrg === -1) risks.push({ kind: "EXIT_NEAR", textVi: "Ngành ở góc Suy yếu — liền trước Tụt hậu (điều kiện bán) trên vòng quay RRG." });
  }
  const warn = (fa?.warnings ?? []).find((w) => w.level === "warn");
  if (warn) risks.push({ kind: "FA_WARN", textVi: `${warn.text} (${warn.source ?? "PFA"}).` });
  const liq = layers.find((l) => l.id === "LIQUIDITY");
  if (liq?.direction === -1) risks.push({ kind: "LIQUIDITY", textVi: `Thanh khoản ${liq.stateVi}.` });
  const inverted = new Set((evolution?.signals ?? []).filter((s) => s.trendTag === "INVERTED").map((s) => s.id));
  for (const s of signals) if (inverted.has(s.id) && fin(s.pctUniverse) && s.pctUniverse >= 80) risks.push({ kind: "INVERTED_SIGNAL", textVi: `${s.labelVi} ở phân vị ${nf(s.pctUniverse, 0)} — tín hiệu này đang dự báo ngược chiều (IC âm có ý nghĩa).` });
  const events = [];
  const nx = fa?.calendar?.next;
  if (nx) { const d = nx.date ?? nx.expected; if (d) events.push({ date: d, kindVi: nx.date ? "Công bố KQKD" : "Dự kiến công bố KQKD", source: "PFA lịch KQKD" }); }
  for (const e of fa?.events?.upcoming ?? []) if (e.date) events.push({ date: e.date, kindVi: e.label ?? e.cat ?? "Sự kiện", source: "PFA sự kiện đã công bố" });
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { strengths, risks: risks.slice(0, 3), nextEvent: events[0] ?? null };
}

/** Dựng toàn bộ ảnh chụp (hàm thuần). */
export function buildProfileSnapshot({ ticker, panel, decision, evidence = null, evolution = null, registry = null, fa = null, ai = null, bars = null, failed = [], now = Date.now }) {
  const row = (panel?.rows ?? []).find((r) => r.ticker === ticker) ?? null;
  const score = (decision?.scores ?? []).find((s) => s.ticker === ticker) ?? null;
  const hlRow = row ? hlScores(panel.rows).find((x) => x.ticker === ticker) ?? null : null;
  const pos = hlPosition(decision, ticker);
  const pick = (decision?.portfolio ?? []).find((p) => p.ticker === ticker && p.hl) ?? null;
  const signals = row ? profileSignals({ panel, row, evidence, evolution, contributions: score?.contributions }) : [];
  const layers = profileLayers({ row, hlRow, pos, score, fa, ai, evidence, registry, panel, decision });
  const thesis = profileThesis({ layers, pos, decision, fa, signals, evolution });
  const flowMissing = (panel?.missingSources ?? []).includes("researchFeatures");
  const series = Array.isArray(bars) ? bars.slice(-PRICE_BARS).map(([d, c]) => [d, r4(c)]) : null;
  return {
    version: PROFILE_VERSION, ticker, session: panel?.date ?? decision?.date ?? null, builtAt: new Date(now()).toISOString(),
    missing: [...new Set([...(panel?.missingSources ?? []), ...failed])],
    freshness: { panel: panel?.generatedAt ?? panel?.date ?? null, decision: decision?.builtAt ?? decision?.date ?? null, evidence: evidence?.calendarLast ?? null,
      evolution: evolution?.generatedAt ?? null, fa: fa?.asOf ?? null, ai: ai?.updatedAt ?? null, price: series?.length ? series[series.length - 1][0] : null },
    header: {
      icb: row?.icb ?? null, sector: row?.sector ?? null, close: r4(score?.close ?? null), inUniverse: Boolean(row),
      hl: pos, warnings: (fa?.warnings ?? []).map((w) => ({ level: w.level, textVi: w.text, source: w.source ?? null })),
    },
    thesis, layers, signals,
    outsideE2: { structure_stage: row?.values?.structure_stage ?? null, log_rvol: row?.values?.log_rvol ?? null },
    eliteScore: score ? { rank: score.rank ?? null, of: decision?.universe?.panel ?? null, Z: r4(score.Z), alpha5Pct: r4(score.alpha5Pct), pOutperform: r4(score.pOutperform),
      flowMissing, contributions: (score.contributions ?? []).filter((c) => c.contribution !== 0).map((c) => ({ id: c.id, contribution: r4(c.contribution) })) } : null,
    price: series ? { bars: series, pivot: pick?.hl?.pz?.pivot ?? null, zone: fin(pick?.hl?.pz?.zoneLow) && fin(pick?.hl?.pz?.zoneHigh) ? [pick.hl.pz.zoneLow, pick.hl.pz.zoneHigh] : null,
      stop: r4(pick?.stop ?? null), stopRef: pick?.hl?.pz?.stopRef ?? null } : null,
    noteVi: "Ảnh chụp chỉ đọc của Hồ sơ 360°: mô tả theo quy tắc và sổ bằng chứng — không phải khuyến nghị đầu tư.",
  };
}

/** Dịch vụ: bộ đệm theo (mã, phiên E1, bản quyết định), 5 phút, tối đa 80 mã. */
export function createProfileSnapshot({ getPanel, getDecision, getEvidence = null, getEvolution = null, registry = null, getProfileFa = null, getAiLedger = null, adjustedCloses = null, now = Date.now, log = console }) {
  const memo = new Map();
  const TTL = 5 * 60_000, MAX = 80;
  async function get(ticker) {
    const panel = await getPanel().panel();
    if (!panel) return null;
    const decision = await getDecision().decision().catch(() => null);
    const key = `${ticker}|${panel.date}|${decision?.builtAt ?? ""}`;
    const hit = memo.get(key);
    if (hit && now() - hit.at < TTL) return hit.doc;
    const failed = [];
    const safe = async (name, f) => { try { return await f(); } catch (e) { failed.push(name); log.warn?.(`[profile] ${ticker} ${name}: ${e.message}`); return null; } };
    const inUniverse = panel.rows.some((r) => r.ticker === ticker) || (decision?.scores ?? []).some((s) => s.ticker === ticker);
    if (!inUniverse) return { notFound: true, session: panel.date };
    const [evidence, evolution, fa, ai, barsMap] = await Promise.all([
      safe("evidence", () => getEvidence?.()?.evidence()), safe("evolution", () => getEvolution?.()?.get()),
      safe("profileFa", () => getProfileFa?.()?.ticker(ticker)), safe("aiLedger", () => getAiLedger?.()?.read({ ticker, limit: 60 })),
      safe("price", () => adjustedCloses?.([ticker], panel.date)),
    ]);
    const doc = buildProfileSnapshot({ ticker, panel, decision, evidence, evolution, registry: registry?.() ?? null, fa, ai, bars: barsMap?.get?.(ticker) ?? null, failed, now });
    memo.set(key, { at: now(), doc });
    if (memo.size > MAX) memo.delete(memo.keys().next().value);
    return doc;
  }
  return { get };
}
