// I0-G1 (19/11/2026) — Chấm sổ tín hiệu Chất xúc tác trên Gateway.
// Bối cảnh: sổ `catkv/ledger` (engine xúc tác đóng gói từ Project A) ghi tín hiệu từ 30/10/2026 nhưng KHÔNG có tác vụ chấm khi dời về Gateway
// (191 tín hiệu, 0 đã chấm ngày 19/11). Tác vụ này:
//   1) gắn NGỮ CẢNH sự kiện (loại, mức độ, số nguồn xác nhận, thời điểm đăng, phiên bản bộ phân loại) từ Event Radar theo sourceId = eventId;
//   2) tính t0 và AR(5), AR(20) ĐÚNG giao thức X6 (catalystValidation/eventStudy.js — không đổi tham số).
// Ghi vào KHOÁ RIÊNG (`ledger-eval`, `ledger-context`): tác vụ quét ghi đè cả khoá `ledger` 8 lần/ngày, dùng chung khoá có thể mất dữ liệu.
// SỔ BỊT MẮT: route công khai chỉ trả số đếm tiến độ, không trả lợi suất trung bình trước khi chấm X6-F theo đăng ký trước.
import { abnormalReturns, PREREG, vnDateOf } from "../catalystValidation/eventStudy.js";

export const LEDGER_KEY = "ledger";
export const EVAL_KEY = "ledger-eval";
export const CONTEXT_KEY = "ledger-context";
export const EVAL_META_KEY = "ledger-eval-meta";

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Ngày làm việc thứ n sau một ngày (bỏ T7/CN, không tính lễ) — chỉ để ƯỚC TÍNH ngày đủ phiên. */
export function addWeekdays(iso, n) {
  let d = iso, k = 0;
  while (k < n) { d = addDays(d, 1); const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); if (wd !== 0 && wd !== 6) k++; }
  return d;
}

/** Ngữ cảnh gọn của một sự kiện Event Radar (chỉ các trường cần cho nghiên cứu). */
export function contextOf(ev) {
  if (!ev) return null;
  return {
    eventType: ev.eventType ?? null, severity: ev.severity ?? null, severityScore: ev.severityScore ?? null, sentiment: ev.sentiment ?? null,
    corroborationCount: ev.corroborationCount ?? null, sourceAuthority: ev.sourceAuthority ?? null, entityConfidence: ev.entityConfidence ?? null,
    publishedAt: ev.publishedAt ?? null, firstSeenAt: ev.firstSeenAt ?? null, classifierVersion: ev.classifierVersion ?? null,
  };
}

/**
 * @param {{ kvGet: (k:string)=>Promise<any>, kvSet: (k:string,v:any)=>Promise<any>, getBars: (symbol:string, from:string)=>Promise<{date:string,close:number,partial?:boolean}[]>,
 *           getRadarEvent: (id:string)=>Promise<any>, now?: ()=>number, log?: Console }} deps
 */
export function createLedgerEvaluator({ kvGet, kvSet, getBars, getRadarEvent, now = Date.now, log = console }) {
  async function run() {
    const ledger = (await kvGet(LEDGER_KEY)) ?? {};
    const evals = (await kvGet(EVAL_KEY)) ?? {};
    const ctx = (await kvGet(CONTEXT_KEY)) ?? {};
    const recs = Object.values(ledger).filter((r) => r?.id && r.ticker && r.scannedAt);
    // 1) ngữ cảnh: chỉ lấy một lần cho mỗi bản ghi (giá trị tại thời điểm gần tín hiệu nhất mà Gateway còn giữ)
    let ctxAdded = 0;
    for (const r of recs) {
      if (ctx[r.id] !== undefined) continue;
      const ev = await getRadarEvent(r.sourceId).catch(() => null);
      ctx[r.id] = ev ? { ...contextOf(ev), capturedAt: new Date(now()).toISOString() } : null;
      if (ev) ctxAdded++;
    }
    // 2) chấm theo giao thức X6
    const today = vnDateOf(new Date(now()).toISOString());
    const pending = recs.filter((r) => !(evals[r.id]?.ar20 != null));
    const byTicker = new Map();
    for (const r of pending) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r]);
    const from = addDays(pending.reduce((m, r) => (vnDateOf(r.scannedAt) < m ? vnDateOf(r.scannedAt) : m), today), -10);
    const index = pending.length ? await getBars("VNINDEX", from) : [];
    let scored = 0, noPrice = 0;
    for (const [ticker, rs] of byTicker) {
      const bars = await getBars(ticker, from).catch(() => null);
      if (!bars?.length) { noPrice += rs.length; continue; }
      for (const r of rs) {
        const { t0, ar } = abnormalReturns(bars, index, r.scannedAt, PREREG.horizons);
        const p0 = t0 ? bars.find((b) => b.date === t0)?.close ?? null : null;
        evals[r.id] = { t0, ar5: ar[5] ?? null, ar20: ar[20] ?? null, priceAtT0: p0, evaluatedOn: today };
        scored++;
      }
    }
    await kvSet(CONTEXT_KEY, ctx);
    await kvSet(EVAL_KEY, evals);
    const meta = { ranAt: new Date(now()).toISOString(), records: recs.length, scored, noPrice, ctxAdded };
    await kvSet(EVAL_META_KEY, meta);
    log.log?.(`[catalyst-ledger] chấm ${scored}, thiếu giá ${noPrice}, ngữ cảnh mới ${ctxAdded}`);
    return meta;
  }

  /** Tiến độ cho X6-F — CHỈ số đếm (sổ bịt mắt), không có lợi suất. */
  async function progress() {
    const ledger = (await kvGet(LEDGER_KEY)) ?? {};
    const evals = (await kvGet(EVAL_KEY)) ?? {};
    const ctx = (await kvGet(CONTEXT_KEY)) ?? {};
    const meta = (await kvGet(EVAL_META_KEY)) ?? null;
    const recs = Object.values(ledger).filter((r) => r?.id && r.scannedAt >= `${PREREG.forwardFrom}T00:00:00`);
    const clusters = (pred) => new Set(recs.filter(pred).map((r) => r.sourceId)).size;
    const m5 = (r) => evals[r.id]?.ar5 != null, m20 = (r) => evals[r.id]?.ar20 != null;
    const t0s = recs.map((r) => evals[r.id]?.t0).filter(Boolean).sort();
    // ước tính ngày có đủ minN tín hiệu 20 phiên: t0 + 20 ngày làm việc, tín hiệu thứ minN theo thứ tự
    const est = recs.map((r) => evals[r.id]?.t0 ? addWeekdays(evals[r.id].t0, PREREG.primary) : addWeekdays(vnDateOf(r.scannedAt), PREREG.primary + 1)).sort();
    return {
      protocol: "X6 (catalystValidation/X6-prereg.md) — kiểm định tiến X6-F",
      blind: true,
      forwardFrom: PREREG.forwardFrom,
      signals: recs.length, clusters: clusters(() => true),
      matured5: recs.filter(m5).length, matured20: recs.filter(m20).length, clustersMatured20: clusters(m20),
      minN: PREREG.minN,
      estimatedReadyOn: est.length >= PREREG.minN ? est[PREREG.minN - 1] : null,
      firstT0: t0s[0] ?? null,
      withContext: recs.filter((r) => ctx[r.id]).length,
      lastRun: meta,
    };
  }

  return { run, progress };
}
