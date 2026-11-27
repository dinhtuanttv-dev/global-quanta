// EV-4 (27/11/2026) — TIẾN HOÁ BẰNG CHỨNG cho tab QUYẾT ĐỊNH › 4 (docs/TAB4_EVIDENCE_EVOLUTION_BLUEPRINT_V1.md, có sửa theo dữ liệu thật).
//
// CHỈ ĐỌC + MÔ TẢ. Không ghi vào elite:ic / elite:evidence, không đổi bậc E2, không đổi trọng số E3, không đổi tham số Elite HL.
// Mọi "đề xuất" là việc cho NGƯỜI duyệt (kèm yêu cầu đăng ký trước); không có đường nào để code tự sửa quy tắc chính thức.
//
// Đầu vào: tài liệu E2 (evidenceEngine.evaluate), chuỗi IC ngày (elite:ic, kèm chuỗi LS-v1 nếu có trong bộ nhớ), nến VN-Index,
// tóm tắt các sổ tiến (HL, dòng tiền, Elite × TO), sổ phán quyết AI (ARL-v1) và sổ bằng chứng ER-v1.
//
// Khác Blueprint v1.0 (lý do ghi tại chỗ):
//  - LOW_COVERAGE xét TRƯỚC mọi nhãn khác: thiếu dữ liệu thì các nhãn còn lại không đáng tin.
//  - EMERGING chỉ cho tín hiệu cấp MÃ: tín hiệu cấp NGÀNH (rrg_quadrant, ws_sector_alpha) có cùng giá trị cho mọi mã trong ngành nên
//    IC hạng ngày bị cụm (≈ 20 giá trị khác nhau), t phóng đại -> không gắn EMERGING.
//  - EMERGING là ỨNG VIÊN: n < 40 nên chưa qua kiểm soát Benjamini–Hochberg của E2 — kèm số ứng viên kỳ vọng do may mắn.
//  - BSS của AI: ARL-v1 không ghi xác suất dự báo (chỉ cán cân luận điểm) -> KHÔNG tính BSS; dùng giá trị gia tăng theo giỏ của ARL.
//  - Challenger: chưa có bản đăng ký trước -> danh sách rỗng, không dựng sổ bóng (dựng trước khi đăng ký là lọc dữ liệu).
import { summarize } from "./icCore.js";
import { regimeSeries } from "../cashGate/cashGateCore.js";
import { SPEC_BY_ID } from "./signalRegistry.js";

export const EVOLUTION_VERSION = "EV-4.0 (2026-11-27)";
export const EVOLUTION_KV = "elite:evidence:evolution";
export const EV4 = Object.freeze({
  nShrink: 30, tFull: 3, rollWindow: 20, rollGain: 250, minRegimeN: 10, horizonT: 1,
  lowCoverage: { minExpected: 15, ratio: 0.5 },
  inverted: { minN: 30, t: -2, horizons: [1, 5] },
  emerging: { minN: 10, maxN: 59, t: 2 },
  decaying: { minN: 60, q: 0.15, rollRatio: 0.5 },
  proven: { sqs: 70, q: 0.05 },
  tierDecisionN: 60, fdrN: 40, studyN: 30,
});
const HS = [1, 5, 10, 20];
const REGIMES = ["UPTREND", "SIDEWAY", "DOWNTREND"];
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r1 = (x) => (fin(x) ? Math.round(x * 10) / 10 : null);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const r6 = (x) => (fin(x) ? Math.round(x * 1e6) / 1e6 : null);

/** Chuỗi IC (ngày tăng dần) ở một kỳ hạn: { dates đã đo, values, attempted = mọi ngày đã thử (kể cả không đo được) }. */
export function icSeriesAt(icDoc, id, h) {
  const m = icDoc?.series?.[id]?.[h] ?? {};
  const all = Object.keys(m).sort();
  const dates = [], values = [];
  for (const d of all) { const v = m[d]?.[0]; if (fin(v)) { dates.push(d); values.push(v); } }
  // Kỳ vọng tính TỪ ngày đầu tín hiệu có dữ liệu (n > 0): ngày trước khi tín hiệu tồn tại ([null, 0]) không phải ngày "mất".
  const first = all.findIndex((d) => (m[d]?.[1] ?? 0) > 0);
  return { dates, values, attempted: first < 0 ? 0 : all.length - first };
}

/** Thành phần SQS ∈ [0, 100] (Blueprint §2.1). byH: kết quả E2 của tín hiệu; rolling20: IC TB 20 ngày gần nhất (null nếu < 20). */
export function sqsParts({ byH, mainH, rolling20, coverageRatio }, rules = EV4) {
  const main = byH?.[mainH] ?? {};
  const n = main.n ?? 0;
  const tPos = clip((main.t ?? 0) / rules.tFull, 0, 1);
  const stat = 40 * tPos * (0.35 + 0.65 * (n / (n + rules.nShrink)));
  const [m1, m2] = Array.isArray(main.halves) ? main.halves : [null, null];
  const halves = fin(m1) && fin(m2) && m1 > 0 && m2 > 0 ? 15 : fin(m2) && m2 > 0 ? 7 : 0;
  // Chưa đủ 20 ngày -> trung tính 5 (không thưởng, không phạt).
  const roll = fin(rolling20) && fin(main.mean) ? clip(5 + rules.rollGain * (rolling20 - main.mean), 0, 10) : 5;
  const horizon = 5 * HS.filter((h) => fin(byH?.[h]?.mean) && byH[h].mean > 0 && fin(byH[h].t) && byH[h].t >= rules.horizonT).length;
  const coverage = 15 * clip(fin(coverageRatio) ? coverageRatio : 0, 0, 1);
  const sqs = Math.round(stat + halves + roll + horizon + coverage);
  return { sqs, breakdown: { stat: r1(stat), stability: r1(halves + roll), horizon, coverage: r1(coverage) } };
}

/** Nhãn xu hướng (Blueprint §2.1, thứ tự xét: LOW_COVERAGE → INVERTED → DECAYING → PROVEN_LEADER → EMERGING → NEUTRAL). */
export function trendTag({ signal, level, sqs, rolling20, coverage }, rules = EV4) {
  const main = signal.byH?.[signal.mainH] ?? {};
  if (coverage.expected >= rules.lowCoverage.minExpected && coverage.ratio < rules.lowCoverage.ratio) return "LOW_COVERAGE";
  for (const h of rules.inverted.horizons) {
    const x = signal.byH?.[h];
    if (x && x.n >= rules.inverted.minN && fin(x.mean) && x.mean < 0 && fin(x.t) && x.t <= rules.inverted.t) return "INVERTED";
  }
  if (["A", "B"].includes(signal.priorTier) && main.n >= rules.decaying.minN
    && ((fin(main.q) && main.q > rules.decaying.q) || (fin(rolling20) && fin(main.mean) && main.mean > 0 && rolling20 < rules.decaying.rollRatio * main.mean))) return "DECAYING";
  if (["A", "B"].includes(signal.tier) && sqs >= rules.proven.sqs && fin(main.q) && main.q <= rules.proven.q) return "PROVEN_LEADER";
  const [m1, m2] = Array.isArray(main.halves) ? main.halves : [null, null];
  if (level === "stock" && main.n >= rules.emerging.minN && main.n <= rules.emerging.maxN && fin(main.mean) && main.mean > 0
    && fin(main.t) && main.t >= rules.emerging.t && m1 > 0 && m2 > 0) return "EMERGING";
  return "NEUTRAL";
}

/** Chế độ thị trường point-in-time theo ngày (đúng cashGateCore.regimeSeries trên nến VN-Index đã đóng). */
export function regimeByDate(bars) {
  const ok = (bars ?? []).filter((b) => b && b.date && fin(b.close) && b.close > 0);
  const reg = regimeSeries(ok.map((b) => b.close));
  return new Map(ok.map((b, i) => [String(b.date).slice(0, 10), reg[i]]));
}

/** IC theo chế độ thị trường của ngày tín hiệu d (Blueprint §2.2). */
export function regimeIc(series, regimes, h, rules = EV4) {
  const groups = Object.fromEntries(REGIMES.map((r) => [r, []]));
  series.dates.forEach((d, i) => { const r = regimes.get(d); if (r && groups[r]) groups[r].push(series.values[i]); });
  const out = {};
  for (const r of REGIMES) { const s = summarize(groups[r], h); out[r] = { n: s.n, mean: r4(s.mean), t: r4(s.t) }; }
  const means = REGIMES.filter((r) => out[r].n >= rules.minRegimeN && fin(out[r].mean)).map((r) => out[r].mean);
  return { byRegime: out, spread: means.length >= 2 ? r4(Math.max(...means) - Math.min(...means)) : null };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Một dòng tín hiệu của tài liệu tiến hoá. */
export function evolveSignal(signal, icDoc, regimes, rules = EV4) {
  const h = signal.mainH;
  const series = icSeriesAt(icDoc, signal.id, h);
  const level = SPEC_BY_ID.get(signal.id)?.level ?? "stock";
  const measured = signal.byH?.[h]?.n ?? series.values.length;
  // Chuỗi LS-v1 hồi cứu không có ngày "không đo được" -> kỳ vọng = số đã đo.
  const expected = Math.max(series.attempted, measured);
  const coverage = { measured, expected, ratio: expected ? measured / expected : 0 };
  const rolling20 = series.values.length >= rules.rollWindow ? mean(series.values.slice(-rules.rollWindow)) : null;
  const { sqs, breakdown } = sqsParts({ byH: signal.byH, mainH: h, rolling20, coverageRatio: coverage.ratio }, rules);
  const tag = trendTag({ signal, level, sqs, rolling20, coverage }, rules);
  const reg = regimeIc(series, regimes, h, rules);
  return {
    id: signal.id, tab: signal.tab, labelVi: signal.labelVi, level, tier: signal.tier, priorTier: signal.priorTier, mainH: h,
    n: measured, sqs, sqsBreakdown: breakdown, trendTag: tag, rollingIc20: r4(rolling20), icAll: r4(signal.byH?.[h]?.mean ?? null),
    coverageRatio: r4(coverage.ratio), measured, expected, regimeIc: reg.byRegime, regimeSpread: reg.spread,
  };
}

const ledgerH = (summary, h) => summary?.horizons?.[h] ?? null;

/** Đề xuất tự tiến hoá (Blueprint §2.4) — chỉ là việc cần người duyệt; mỗi đề xuất ghi rõ bằng chứng và điều kiện. */
export function proposals(signals, { ai, hl } = {}, rules = EV4) {
  const out = [];
  for (const s of signals) {
    if (s.trendTag === "LOW_COVERAGE") out.push({ id: `fix-${s.id}`, priority: "HIGH", kind: "DATA_FIX", targetArea: "E1_INGESTION",
      titleVi: `${s.labelVi}: chỉ đo được ${s.measured}/${s.expected} ngày`,
      evidenceVi: `Độ phủ ${Math.round(s.coverageRatio * 100)}% ở kỳ hạn chính ${s.mainH} phiên. Ngày không đo được = tín hiệu thiếu hoặc HẰNG trên cả vũ trụ (IC không xác định).`,
      suggestedActionVi: "Sửa nguồn ở sổ E1. Nếu đổi định nghĩa (VD cờ 0/1 -> tỷ lệ mua ròng / GTGD TB20) thì thêm tín hiệu MỚI bậc C, giữ tín hiệu cũ — không sửa chuỗi đã đo." });
    if (s.trendTag === "INVERTED") out.push({ id: `inv-${s.id}`, priority: "HIGH", kind: "SIGNAL_INVERTED", targetArea: "E2_EVIDENCE",
      titleVi: `${s.labelVi}: dự báo NGƯỢC chiều có ý nghĩa`, evidenceVi: `IC âm, t ≤ ${rules.inverted.t} ở kỳ hạn 1 hoặc 5 phiên.`,
      suggestedActionVi: "Đăng ký trước kiểm định đảo chiều (dấu âm) trước khi dùng; luật giáng bậc E2 tự xử lý phần giáng." });
    if (s.trendTag === "DECAYING") out.push({ id: `decay-${s.id}`, priority: "MEDIUM", kind: "SIGNAL_DECAY", targetArea: "E2_EVIDENCE",
      titleVi: `${s.labelVi}: bậc khởi điểm ${s.priorTier} nhưng bằng chứng đo lại yếu`,
      evidenceVi: `IC TB ${s.icAll ?? "—"} (${s.n} ngày)${s.rollingIc20 != null ? `, 20 ngày gần nhất ${s.rollingIc20}` : ""}; q BH > ${rules.decaying.q} hoặc IC gần đây < ${rules.decaying.rollRatio} × IC toàn kỳ.`,
      suggestedActionVi: "Theo dõi; luật bậc E2 (đăng ký trước) chỉ giáng khi IC âm có ý nghĩa. Muốn đổi luật thì cần bản đăng ký trước mới." });
    if (s.trendTag === "EMERGING") out.push({ id: `emg-${s.id}`, priority: "INFO", kind: "SIGNAL_EMERGING", targetArea: "E2_EVIDENCE",
      titleVi: `${s.labelVi}: ứng viên mới nổi (${s.n} ngày)`,
      evidenceVi: `IC TB ${s.icAll}, dương ở cả hai nửa; chưa đủ ${rules.fdrN} ngày để qua kiểm soát Benjamini–Hochberg.`,
      suggestedActionVi: `Chờ đủ ${rules.tierDecisionN} ngày để luật bậc E2 tự xét thăng B. Không đưa vào Điểm Elite trước đó.` });
    if (s.n >= rules.tierDecisionN && s.n < rules.tierDecisionN + 5 && s.tier === s.priorTier) out.push({ id: `ready-${s.id}`, priority: "INFO", kind: "STUDY_READY", targetArea: "E2_EVIDENCE",
      titleVi: `${s.labelVi}: vừa đủ ${rules.tierDecisionN} ngày đo`, evidenceVi: "Từ nay luật thăng / giáng bậc E2 có hiệu lực cho tín hiệu này.", suggestedActionVi: "Không cần làm gì — engine E2 tự xét mỗi phiên." });
  }
  if (ai && (ai.scored5 ?? 0) >= rules.studyN) out.push({ id: "ready-arl", priority: "MEDIUM", kind: "STUDY_READY", targetArea: "AI_ROOM",
    titleVi: `Sổ phán quyết AI đủ ${ai.scored5} bản đã chấm 5 phiên`, evidenceVi: "Đủ mẫu tối thiểu của ARL-v1 để đọc giá trị gia tăng theo giỏ.", suggestedActionVi: "Viết bản đăng ký trước AR-r1 trước khi dùng cán cân AI trong quyết định." });
  if (hl && (hl.settled10 ?? 0) >= rules.studyN) out.push({ id: "ready-hl", priority: "MEDIUM", kind: "STUDY_READY", targetArea: "ELITE_HL",
    titleVi: `Sổ tiến Elite HL đủ ${hl.settled10} phiên đã chấm 10 phiên`, evidenceVi: "Đủ để đọc sơ bộ lợi suất vượt sau phí của danh mục chính thức.", suggestedActionVi: "Đọc kết quả, không đổi quy tắc khi chưa có kiểm định đăng ký trước." });
  const rank = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/** Dựng toàn bộ tài liệu tiến hoá từ các nguồn đã có (hàm thuần). */
export function buildEvolution({ evidence, icDoc, vnBars = [], ledgerHl = null, ledgerFlow = null, toShadow = null, aiLedger = null, registry = null, now = Date.now }, rules = EV4) {
  const regimes = regimeByDate(vnBars);
  const lastBar = [...regimes.keys()].sort().pop() ?? null;
  const signals = (evidence?.signals ?? []).map((s) => evolveSignal(s, icDoc, regimes, rules));
  const count = (t) => signals.filter((s) => s.trendTag === t).length;
  const emergingEligible = signals.filter((s) => s.level === "stock" && s.n >= rules.emerging.minN && s.n <= rules.emerging.maxN).length;
  const hl10 = ledgerH(ledgerHl?.summary, "10"), hl5 = ledgerH(ledgerHl?.summary, "5"), fl10 = ledgerH(ledgerFlow?.summary, "10");
  const arl = aiLedger?.summary ?? null;
  const arlH = (h) => arl?.horizons?.[h] ?? null;
  const ai = { scored5: arlH("5")?.n ?? 0 };
  const hl = { settled10: hl10?.n ?? 0 };
  const readiness = [
    { id: "HL-LEDGER", title: "Sổ tiến Elite HL — phiên đã chấm 10 phiên", currentSamples: hl10?.n ?? 0, targetSamples: rules.studyN },
    { id: "ARL-v1", title: "Sổ phán quyết AI — bản đã chấm 5 phiên", currentSamples: arlH("5")?.n ?? 0, targetSamples: rules.studyN },
    { id: "ELITE-TO", title: "Sổ ảo Elite × Săn cổ tức — ngày ghi sổ", currentSamples: toShadow?.days ?? 0, targetSamples: toShadow?.rule?.minDays ?? 60 },
    ...signals.filter((s) => s.n < rules.tierDecisionN && s.n > 0).map((s) => ({ id: `E2:${s.id}`, title: `E2 · ${s.labelVi}`, currentSamples: s.n, targetSamples: rules.tierDecisionN })),
  ].map((x) => ({ ...x, progressPct: Math.round(clip(x.targetSamples ? x.currentSamples / x.targetSamples : 0, 0, 1) * 100), readyToEvaluate: x.currentSamples >= x.targetSamples }));
  return {
    version: EVOLUTION_VERSION, generatedAt: new Date(now()).toISOString(), calendarLast: evidence?.calendarLast ?? null,
    evidenceVersion: evidence?.version ?? null, currentRegime: lastBar ? regimes.get(lastBar) : "UNKNOWN", regimeAsOf: lastBar,
    rules: { ...rules, noteVi: "Chỉ mô tả: không đổi bậc E2, trọng số E3 hay quy tắc Elite HL. Đề xuất cần người duyệt và bản đăng ký trước." },
    scorecard: {
      liveAlpha: {
        championId: "ELITE_HL", championVersion: ledgerHl?.version ?? null, sessionsRecorded: ledgerHl?.entries?.length ?? 0,
        settled5: hl5?.n ?? 0, settled10: hl10?.n ?? 0, hlExcess10: r6(hl10?.meanExcess ?? null), flowExcess10: r6(fl10?.meanExcess ?? null),
        flowSettled10: fl10?.n ?? 0, toCompExcess: r6(toShadow?.delta?.comp?.total ?? null), toDays: toShadow?.days ?? 0,
      },
      signalHealth: {
        totalSignals: signals.length, provenCount: count("PROVEN_LEADER"), emergingCount: count("EMERGING"), decayingCount: count("DECAYING"),
        invertedCount: count("INVERTED"), lowCoverageCount: count("LOW_COVERAGE"),
        meanSqs: signals.length ? Math.round(signals.reduce((a, s) => a + s.sqs, 0) / signals.length) : 0,
        // Ứng viên kỳ vọng do may mắn: P(t ≥ 2) ≈ 2,3% × P(cùng dấu hai nửa | dương) ≈ 0,5 -> ~1,1% mỗi tín hiệu đủ điều kiện xét.
        emergingByChance: r1(emergingEligible * 0.0228 * 0.5), emergingEligible,
      },
      aiSkill: {
        version: arl?.version ?? null, label: arl?.label ?? null, totalEntries: arl?.total ?? 0, scored5: arlH("5")?.n ?? 0,
        bss: null, bssNoteVi: "Chưa tính BSS: sổ ARL-v1 lưu cán cân luận điểm, không lưu xác suất dự báo. Cần thêm trường xác suất (đăng ký trước) mới đo được.",
        incrementalAlpha: Object.fromEntries(["5", "10"].map((h) => {
          const x = arlH(h);
          return [h, { agree: x?.positive ?? { n: 0, meanExcess: null }, caution: x?.negative ?? { n: 0, meanExcess: null }, flat: x?.flat ?? { n: 0, meanExcess: null }, baseline: x?.baseline ?? null, valueAdd: x?.valueAdd ?? null }];
        })),
      },
      readinessQueue: readiness,
    },
    signals,
    registryProgress: (registry?.entries ?? []).map((e) => ({ id: e.id, verdict: e.verdict, liveStatus: "STATIC_VERDICT" })),
    challengers: [],
    challengersNoteVi: "Chưa dựng sổ bóng Challenger: quy tắc của từng Challenger phải được đăng ký trước (ghi trước khi nhìn kết quả). Dựng trước rồi chọn là lọc dữ liệu.",
    proposals: proposals(signals, { ai, hl }, rules),
  };
}

/** Dịch vụ: dựng theo yêu cầu, nhớ 10 phút, ghi KV để khởi động lại không trống. */
export function createEvidenceEvolution({ store, getEvidence, getDecision = null, getToShadow = null, getAiLedger = null, vnBars = null, registry = null, now = Date.now, log = console }) {
  let memo = null, running = null;
  const TTL = 10 * 60_000;
  const safe = async (f) => { try { return await f(); } catch (e) { log.warn?.(`[evolution] ${e.message}`); return null; } };
  async function build() {
    const eng = getEvidence();
    const evidence = await eng.evidence();
    if (!evidence) return null;
    const [icDoc, ledgerHl, ledgerFlow, toShadow, aiLedger, bars] = await Promise.all([
      safe(() => eng.icDocument()), safe(() => getDecision?.()?.ledger(null)), safe(() => getDecision?.()?.ledger("flow")),
      safe(() => getToShadow?.()?.summary()), safe(() => getAiLedger?.()?.read?.({ limit: 1 })), safe(() => vnBars?.()),
    ]);
    const doc = buildEvolution({ evidence, icDoc: icDoc ?? { series: {} }, vnBars: bars ?? [], ledgerHl, ledgerFlow, toShadow, aiLedger, registry: registry?.() ?? null, now });
    try { await store?.setKv?.(EVOLUTION_KV, doc); } catch (e) { log.warn?.(`[evolution] lưu KV: ${e.message}`); }
    memo = { at: now(), doc };
    return doc;
  }
  async function get({ refresh = false } = {}) {
    if (!refresh && memo && now() - memo.at < TTL) return memo.doc;
    if (running) return running;
    running = build().catch(async (e) => {
      log.warn?.(`[evolution] dựng lỗi: ${e.message}`);
      if (memo) return memo.doc;
      try { return (await store?.getKv?.(EVOLUTION_KV))?.value ?? null; } catch { return null; }
    }).finally(() => { running = null; });
    return running;
  }
  return { get };
}
