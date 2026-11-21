// NHỊP QUYẾT ĐỊNH HÔM NAY (20/11/2026, docs/elite-hl-pulse 02) — mô hình hiển thị hợp nhất "Hôm nay" + "Thay đổi hôm nay" của Bảng
// quyết định Elite HL. HÀM THUẦN: chỉ đọc tài liệu quyết định đã tải + lịch sử theo phiên (hl-history, đã tải cho lớp xu hướng / buồng
// lái). Không gọi API, không đọc đồng hồ, không tính lại danh mục; mọi số chép NGUYÊN VĂN từ trường nguồn có ghi tên (`sourceFields`).
// Hai miền tách bạch: DANH MỤC (mốc hl.prevDate) và VỊ TRÍ GIÁ (toWatch/backToZone so với ảnh chụp PZ trước — payload không có ngày).
import type { EliteDecision, PzState } from "./decisionTypes";
import { hlCadenceVi } from "./hlCadence";

export type PulseStatus = "FROZEN" | "STALE" | "NO_BASELINE" | "CHANGED" | "STABLE" | "PARTIAL";
export type BaselineKind = "HL_PREV" | "PZ_PREV_SNAPSHOT" | "HISTORY" | "NONE";
export type PulseRowId = "schedule" | "portfolio" | "queue" | "pz" | "turnover" | "dilution";
export type PulseGroup = "DECISION" | "PRICE_POSITION" | "CAPITAL_EVENTS";

export interface PulseMove { t: string; from: string; to: string }
export interface PulseRow {
  id: PulseRowId; group: PulseGroup; label: string;
  current: Record<string, number | string | null>;
  delta: { added?: string[]; removed?: string[]; moved?: PulseMove[]; exits?: { t: string; weight: number | null; since: string | null; reasonVi: string }[]; note?: string } | null;
  baselineKind: BaselineKind; baselineDate: string | null;
  status: PulseStatus; reason: string | null; sourceFields: string[];
  coverage?: { shown: number; total: number };
}
export interface PulseVM {
  overall: PulseStatus; overallWhy: string[];
  session: { date: string; prevDate: string | null; pzDate: string | null; histPrev: string | null; sessionsBehind: number | null };
  rows: PulseRow[];
}
/** Bản gọn một phiên của /api/elite/hl-history (HL-H2: có queue / ill). */
export interface PulseHistSession { date: string; cash: number | null; held: { t: string; pz: string | null }[]; queue?: { t: string }[]; ill?: string[] }

export const PZ_ORDER: PzState[] = ["BUY_ZONE", "IN_BASE", "EXTENDED", "COOLING", "REBASING", "NO_SETUP", "FAILED", "UNKNOWN"];
export const PULSE_STATUS_VI: Record<PulseStatus, string> = {
  FROZEN: "ĐÓNG BĂNG", STALE: "DỮ LIỆU CŨ", NO_BASELINE: "CHƯA CÓ ĐỐI CHIẾU", CHANGED: "CÓ THAY ĐỔI", STABLE: "ỔN ĐỊNH", PARTIAL: "THIẾU",
};

const isStale = (f: EliteDecision["freshness"]) => Boolean(f && ((f.sessionsBehind === 1 && f.overdue) || f.sessionsBehind >= 2));

/** Phiên lịch sử liền trước phiên đang xem (theo ngày), hoặc null. */
function prevHist(sessions: readonly PulseHistSession[] | null | undefined, date: string): PulseHistSession | null {
  return [...(sessions ?? [])].filter((s) => s.date < date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export function pulseModel(d: EliteDecision, histSessions?: readonly PulseHistSession[] | null): PulseVM {
  const hl = d.hl!, ch = hl.changes, r = hl.rule, f = hl.funnel, pz = hl.pz ?? null;
  const frozen = Boolean(hl.dataGuard?.frozen), stale = isStale(d.freshness), noBase = hl.prevDate == null;
  const ph = prevHist(histSessions, d.date);
  const rows: PulseRow[] = [];

  // 1) Lịch xét — không có delta.
  rows.push({
    id: "schedule", group: "DECISION", label: "Lịch xét",
    current: { rebalance: hl.rebalance ? 1 : 0, week: hl.week ?? null, frozen: frozen ? 1 : 0 },
    delta: null, baselineKind: "NONE", baselineDate: null,
    status: frozen ? "FROZEN" : "STABLE",
    reason: frozen ? "Dữ liệu phiên không đủ — không vào, không ra" : hl.rebalance ? (hlCadenceVi(hl).v11 ? "Phiên vào lệnh: được nhận mã mới vào ô trống" : "Phiên vào lệnh của tuần: được nhận mã mới vào ô trống") : (hlCadenceVi(hl).v11 ? `Chỉ xét ra — mua mới ở ${hlCadenceVi(hl).next}` : "Chỉ xét ra — mua mới ở phiên vào lệnh của tuần kế tiếp"),
    sourceFields: ["hl.rebalance", "hl.week", "hl.dataGuard.frozen"],
  });

  // 2) Danh mục — delta là DANH SÁCH mã (mốc hl.prevDate), cộng Δ tiền mặt theo lịch sử nếu có.
  const pfChanged = ch.added.length > 0 || ch.exits.length > 0;
  rows.push({
    id: "portfolio", group: "DECISION", label: "Danh mục",
    current: { held: f.held, slots: r.slots, kept: ch.kept, core: pz?.coreNames ?? null, runner: pz?.runnerNames ?? null, invested: hl.invested ?? null, cash: hl.cash ?? null, prevCash: ph?.cash ?? null, prevCashDate: ph?.date ?? null },
    delta: noBase ? null : {
      added: [...ch.added],
      exits: ch.exits.map((x) => ({ t: x.ticker, weight: x.weight, since: x.since, reasonVi: x.reasonVi })),
    },
    baselineKind: noBase ? "NONE" : "HL_PREV", baselineDate: hl.prevDate ?? null,
    status: frozen ? "FROZEN" : noBase ? "NO_BASELINE" : pfChanged ? "CHANGED" : "STABLE",
    reason: frozen ? "Giữ nguyên vì chốt dữ liệu — không phải kết quả xét đủ quy tắc" : noBase ? "Phiên dựng đầu tiên" : null,
    sourceFields: ["hl.funnel.held", "hl.rule.slots", "hl.pz.coreNames", "hl.pz.runnerNames", "hl.invested", "hl.cash", "hl.changes.added", "hl.changes.exits", "hl.changes.kept"],
  });

  // 3) Hàng chờ (P3) — delta theo lịch sử theo phiên.
  const qNow = (hl.queue ?? []).map((q) => q.ticker), illNow = (hl.queueIlliquid ?? []).map((q) => q.ticker);
  const qPrev = ph?.queue ? ph.queue.map((q) => q.t) : null;
  const qAdded = qPrev ? qNow.filter((t) => !qPrev.includes(t)) : [], qRemoved = qPrev ? qPrev.filter((t) => !qNow.includes(t)) : [];
  rows.push({
    id: "queue", group: "DECISION", label: "Hàng chờ",
    current: { queue: qNow.length, illiquid: illNow.length, prevQueue: qPrev ? qPrev.length : null },
    delta: qPrev ? { added: qAdded, removed: qRemoved } : null,
    baselineKind: qPrev ? "HISTORY" : "NONE", baselineDate: qPrev ? ph!.date : null,
    status: frozen ? "FROZEN" : !qPrev ? "NO_BASELINE" : qAdded.length || qRemoved.length ? "CHANGED" : "STABLE",
    reason: !qPrev ? "Chưa có lịch sử hàng chờ của phiên trước" : null,
    sourceFields: ["hl.queue", "hl.queueIlliquid", "hl-history.sessions[].queue"],
  });

  // 4) Vị trí giá — đủ 8 trạng thái + độ bao phủ; delta (a) toWatch/backToZone, (b) mã đang giữ đổi trạng thái so với lịch sử.
  if (pz) {
    const counts = Object.fromEntries(PZ_ORDER.map((s) => [s, pz.counts?.[s] ?? 0])) as Record<string, number>;
    const sum = PZ_ORDER.reduce((a, s) => a + (pz.counts?.[s] ?? 0), 0);
    const tracked = pz.coverage?.tracked ?? sum, priced = pz.coverage?.priced ?? null;
    const prevPz = new Map((ph?.held ?? []).map((h) => [h.t, h.pz]));
    const moved: PulseMove[] = ph ? d.portfolio.filter((p) => p.hl?.pz && prevPz.has(p.ticker) && prevPz.get(p.ticker) && prevPz.get(p.ticker) !== p.hl.pz.state).map((p) => ({ t: p.ticker, from: prevPz.get(p.ticker)!, to: p.hl!.pz!.state })) : [];
    const tw = ch.toWatch ?? [], bz = ch.backToZone ?? [];
    rows.push({
      id: "pz", group: "PRICE_POSITION", label: "Vị trí giá",
      current: { ...counts, total: sum, tracked, priced, withBase: pz.coverage?.withBase ?? null, date: pz.date ?? null },
      delta: { added: [...bz], removed: [...tw], moved },
      baselineKind: "PZ_PREV_SNAPSHOT", baselineDate: null,
      status: priced != null && priced < tracked ? "PARTIAL" : sum !== tracked ? "PARTIAL" : tw.length || bz.length || moved.length ? "CHANGED" : "STABLE",
      reason: sum !== tracked ? `Tổng trạng thái ${sum} khác số mã theo dõi ${tracked}` : priced != null && priced < tracked ? `${tracked - priced} mã chưa định giá được` : null,
      sourceFields: ["hl.pz.counts", "hl.pz.coverage", "hl.changes.toWatch", "hl.changes.backToZone", "portfolio[].hl.pz.state", "hl-history.sessions[].held[].pz"],
      coverage: { shown: sum, total: tracked },
    });
  } else {
    rows.push({ id: "pz", group: "PRICE_POSITION", label: "Vị trí giá", current: {}, delta: null, baselineKind: "NONE", baselineDate: null, status: "PARTIAL", reason: "Phiên này chưa có vị trí giá (PZ-v2)", sourceFields: ["hl.pz"] });
  }

  // 5) Xoay vòng & phí — % NAV, không tính delta.
  rows.push({
    id: "turnover", group: "CAPITAL_EVENTS", label: "Xoay vòng & phí",
    current: { turnover: ch.turnover ?? null, costEst: ch.costEst ?? null, costBuy: r.costBuy ?? null, costSell: r.costSell ?? null },
    delta: null, baselineKind: noBase ? "NONE" : "HL_PREV", baselineDate: hl.prevDate ?? null,
    status: ch.turnover == null ? "PARTIAL" : noBase ? "NO_BASELINE" : ch.turnover > 0 ? "CHANGED" : "STABLE",
    reason: ch.turnover == null ? "Chưa tính được xoay vòng" : noBase ? "Phiên dựng đầu tiên — xoay vòng là tỷ trọng mua ban đầu" : null,
    sourceFields: ["hl.changes.turnover", "hl.changes.costEst", "hl.rule.costBuy", "hl.rule.costSell"],
  });

  // 6) Pha loãng (P4) — toàn thị trường, tách chưa / đã giao dịch; giao với danh mục ∪ hàng chờ.
  const by = d.dilution?.byTicker ?? null;
  if (by) {
    const all = Object.keys(by).sort(), pending = all.filter((t) => !by[t].listed), listed = all.filter((t) => by[t].listed);
    const mine = new Set([...d.portfolio.filter((p) => p.hl).map((p) => p.ticker), ...qNow, ...illNow]);
    rows.push({
      id: "dilution", group: "CAPITAL_EVENTS", label: "Pha loãng",
      current: { total: all.length, pending: pending.length, listed: listed.length, pendingList: pending.join(", "), listedList: listed.join(", "), mine: all.filter((t) => mine.has(t)).join(", ") },
      delta: null, baselineKind: "NONE", baselineDate: null, status: "STABLE", reason: null,
      sourceFields: ["dilution.byTicker[].listed"],
    });
  } else {
    rows.push({ id: "dilution", group: "CAPITAL_EVENTS", label: "Pha loãng", current: {}, delta: null, baselineKind: "NONE", baselineDate: null, status: "PARTIAL", reason: "Chưa có dữ liệu pha loãng", sourceFields: ["dilution.byTicker"] });
  }

  const overallWhy: string[] = [];
  if (frozen) overallWhy.push("Chốt dữ liệu đang bật");
  if (stale) overallWhy.push(`Bảng chậm ${d.freshness!.sessionsBehind} phiên`);
  if (noBase) overallWhy.push("Chưa có phiên đối chiếu");
  const changedRows = rows.filter((x) => x.status === "CHANGED").map((x) => x.label);
  if (changedRows.length) overallWhy.push(`Có thay đổi: ${changedRows.join(", ")}`);
  const overall: PulseStatus = frozen ? "FROZEN" : stale ? "STALE" : noBase ? "NO_BASELINE" : pfChanged || (ch.toWatch?.length ?? 0) > 0 || (ch.backToZone?.length ?? 0) > 0 ? "CHANGED" : "STABLE";
  return {
    overall, overallWhy,
    session: { date: d.date, prevDate: hl.prevDate ?? null, pzDate: pz?.date ?? null, histPrev: ph?.date ?? null, sessionsBehind: d.freshness?.sessionsBehind ?? null },
    rows,
  };
}
