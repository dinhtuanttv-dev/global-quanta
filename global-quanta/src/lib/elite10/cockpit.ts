// BUỒNG LÁI CHỈ HUY (20/11/2026, docs/elite-hl-cockpit 02–04, quyết định D1) — LÕI DIỄN GIẢI: hàm thuần, không gọi mạng, không đọc kho.
// Chỉ đọc lại những trường Gateway đã gửi (tài liệu quyết định khoá theo phiên, hl-history, nhật ký PZ) để trả lời:
//   sessionSeal        — đang xem phiên nào, khoá lúc nào, phiên bản nào, nguồn phụ nào lệch phiên;
//   funnelModel        — 7 bước phễu kèm TẬP ĐẾM thật (bước 2 và 3 song song), nhánh giữ lại / mua mới / ra, đếm theo mã lý do;
//   resolveBoardState  — MỘT trạng thái chính cho mỗi mã (thứ tự D1) + nhãn phụ khi mã có mặt ở nhiều danh sách;
//   transitionsFrom    — chuỗi chuyển trạng thái của một mã từ hl-history + nhật ký PZ.
// Không có số nào mới; không đổi danh mục, thứ tự hay ngưỡng của engine.
import type { EliteDecision, PzState } from "./decisionTypes";

// ---------- sessionSeal ----------
export interface SealSource { key: string; label: string; date: string | null; lag: boolean }
export interface SessionSeal {
  date: string; builtAt: string; version: string; ruleVersion: string | null;
  pzMode: "DISPLAY" | "GATE" | null; frozen: boolean; frozenWhy: string[];
  sessionsBehind: number | null; overdue: boolean; rebalance: boolean; sources: SealSource[];
}
/** `extra`: ngày của các nguồn phụ đang hiển thị (tin, tín hiệu dòng tiền, rủi ro…). null = chưa tải -> không đánh dấu lệch. */
export function sessionSeal(d: EliteDecision, extra: { key: string; label: string; date: string | null | undefined }[] = []): SessionSeal {
  const hl = d.hl;
  const day = (x: string | null | undefined) => (x ? String(x).slice(0, 10) : null);
  const srcs: SealSource[] = [];
  if (hl?.pz) {
    srcs.push({ key: "pz", label: "Vị trí giá PZ", date: day(hl.pz.date), lag: day(hl.pz.date) !== d.date });
    const bd = hl.pz.baseDates;
    if (bd?.sepa) srcs.push({ key: "sepa", label: "Nền SEPA", date: day(bd.sepa), lag: day(bd.sepa) !== d.date });
  }
  for (const e of extra) { const v = day(e.date); srcs.push({ key: e.key, label: e.label, date: v, lag: v != null && v < d.date }); }
  return {
    date: d.date, builtAt: d.builtAt, version: hl?.version ?? d.version, ruleVersion: hl?.ruleVersion ?? null,
    pzMode: hl?.pz ? (hl.pz.gate ? "GATE" : "DISPLAY") : null,
    frozen: Boolean(hl?.dataGuard?.frozen), frozenWhy: hl?.dataGuard?.reasonsVi ?? [],
    sessionsBehind: d.freshness?.sessionsBehind ?? null, overdue: Boolean(d.freshness?.overdue), rebalance: Boolean(hl?.rebalance), sources: srcs,
  };
}

// ---------- funnelModel ----------
export interface FunnelStep { n: number | null; label: string; countedOn: string; parallel?: boolean; displayOnly?: boolean }
export interface FunnelModel {
  steps: FunnelStep[];
  branch: { prevHeld: number; kept: number; added: number; exited: number; held: number };
  queueByCode: [string, number][]; exitsByCode: [string, number][]; illiquid: number;
  checks: string[]; // bất biến bị vi phạm (rỗng = nhất quán)
}
export const QUEUE_CODE_VI: Record<string, string> = {
  wait: "Chờ phiên đầu tuần", full: "Danh mục đủ suất", sector_cap: "Ngành đủ số mã", no_room: "Hết tiền mặt / trần ngành",
  extended: "Đã quá vùng mua", in_base: "Đang trong nền", no_setup: "Chưa có nền",
};
export const EXIT_CODE_VI: Record<string, string> = { ls: "LS-v1 dưới ngưỡng", ta: "Hết mô hình TA", rrg: "Ngành Tụt hậu", no_data: "Mất dữ liệu" };
const tally = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

export function funnelModel(d: EliteDecision): FunnelModel | null {
  const hl = d.hl; if (!hl) return null;
  const f = hl.funnel, ch = hl.changes;
  const gate = Boolean(hl.pz?.gate);
  const steps: FunnelStep[] = [
    { n: f.panel, label: "Bảng tín hiệu", countedOn: "mọi dòng bảng tín hiệu của phiên" },
    { n: f.tradable, label: "Giao dịch được", countedOn: "toàn bảng (song song với bước 3)", parallel: true },
    { n: f.tier1, label: "Đạt tầng 1", countedOn: "toàn bảng (song song với bước 2)", parallel: true },
    { n: f.selected, label: "Hợp lưu", countedOn: "tập bước 3, ngành RRG ủng hộ" },
    { n: f.selectedTradable, label: "Hợp lưu giao dịch được", countedOn: "bước 4 ∩ bước 2" },
    { n: f.inZone ?? null, label: "Trong vùng mua", countedOn: "tập bước 5, trạng thái PZ = Vùng mua", displayOnly: !gate },
    { n: f.held, label: "Danh mục", countedOn: "mã đang giữ = giữ lại + mua mới" },
  ];
  const added = ch.added.length, exited = ch.exits.length, kept = ch.kept;
  const checks: string[] = [];
  if (f.tradable > f.panel || f.tier1 > f.panel) checks.push("bước 2 / 3 lớn hơn bước 1");
  if (f.selected > f.tier1) checks.push("bước 4 lớn hơn bước 3");
  if (f.selectedTradable > Math.min(f.selected, f.tradable)) checks.push("bước 5 lớn hơn bước 4 hoặc bước 2");
  if (f.inZone != null && f.inZone > f.selectedTradable) checks.push("bước 6 lớn hơn bước 5");
  if (kept + added !== f.held) checks.push(`danh mục ${f.held} ≠ giữ lại ${kept} + mua mới ${added}`);
  if (!hl.rebalance && added > 0) checks.push("có mua mới ở phiên không phải đầu tuần");
  if (hl.dataGuard?.frozen && (added > 0 || exited > 0)) checks.push("có vào / ra khi đang chốt dữ liệu");
  return {
    steps, branch: { prevHeld: kept + exited, kept, added, exited, held: f.held },
    queueByCode: tally(hl.queue.map((q) => String(q.code ?? "khác"))), exitsByCode: tally(ch.exits.map((x) => x.code)),
    illiquid: hl.queueIlliquid?.length ?? 0, checks,
  };
}

// ---------- resolveBoardState (thứ tự D1) ----------
export type PrimaryState = "PORTFOLIO_CORE" | "PORTFOLIO_RUNNER" | "EXITED_TODAY" | "QUEUE" | "BLOCKED" | "WATCH_BASE" | "SECTOR_AGAINST";
export const PRIMARY_ORDER: PrimaryState[] = ["PORTFOLIO_CORE", "PORTFOLIO_RUNNER", "EXITED_TODAY", "QUEUE", "BLOCKED", "WATCH_BASE", "SECTOR_AGAINST"];
export const PRIMARY_VI: Record<PrimaryState, string> = {
  PORTFOLIO_CORE: "Danh mục · lõi", PORTFOLIO_RUNNER: "Danh mục · chạy lãi", EXITED_TODAY: "Vừa ra", QUEUE: "Hàng chờ",
  BLOCKED: "Chưa giao dịch được", WATCH_BASE: "Chờ nền", SECTOR_AGAINST: "Ngành phản đối",
};
export const PZ_VI: Record<PzState, string> = {
  BUY_ZONE: "Vùng mua", IN_BASE: "Trong nền", NO_SETUP: "Chưa có nền", UNKNOWN: "Chưa rõ vị trí giá",
  EXTENDED: "Tăng nóng", COOLING: "Hạ nhiệt", REBASING: "Dựng nền mới", FAILED: "Hỏng nền",
};
export interface BoardStateItem { ticker: string; primary: PrimaryState; secondary: string[]; rank: number | null; detail: string | null; pz: PzState | null }
export interface BoardStates { byTicker: Map<string, BoardStateItem>; counts: Record<PrimaryState, number>; multi: string[] }

export function resolveBoardState(d: EliteDecision): BoardStates {
  const hl = d.hl;
  const counts = Object.fromEntries(PRIMARY_ORDER.map((s) => [s, 0])) as Record<PrimaryState, number>;
  const byTicker = new Map<string, BoardStateItem>(), seen = new Map<string, Set<PrimaryState>>();
  if (!hl) return { byTicker, counts, multi: [] };
  const note = (t: string, s: PrimaryState) => { if (!seen.has(t)) seen.set(t, new Set()); seen.get(t)!.add(s); };
  const pzOf = new Map<string, PzState>();
  for (const p of d.portfolio) {
    const h = (p as { hl?: { rank?: number; pz?: { state: PzState; lane: string | null } } }).hl; if (!h) continue;
    note(p.ticker, h.pz?.lane === "RUNNER" ? "PORTFOLIO_RUNNER" : "PORTFOLIO_CORE");
    if (h.pz) pzOf.set(p.ticker, h.pz.state);
  }
  for (const x of hl.changes.exits) note(x.ticker, "EXITED_TODAY");
  for (const q of hl.queue) { note(q.ticker, "QUEUE"); if (q.pz) pzOf.set(q.ticker, q.pz.state); }
  for (const q of hl.queueIlliquid ?? []) { note(q.ticker, "BLOCKED"); if (q.pz) pzOf.set(q.ticker, q.pz.state); }
  for (const w of hl.watch ?? []) { if (!w.held) note(w.ticker, "WATCH_BASE"); pzOf.set(w.ticker, w.pz.state); }
  for (const a of hl.against) note(a.ticker, "SECTOR_AGAINST");
  const rankOf = new Map<string, number>();
  for (const p of d.portfolio) { const r = (p as { hl?: { rank?: number } }).hl?.rank; if (r != null) rankOf.set(p.ticker, r); }
  for (const q of [...hl.queue, ...(hl.queueIlliquid ?? [])]) rankOf.set(q.ticker, q.hlRank);
  for (const a of hl.against) if (!rankOf.has(a.ticker)) rankOf.set(a.ticker, a.hlRank);
  for (const w of hl.watch ?? []) if (!rankOf.has(w.ticker) && w.hlRank != null) rankOf.set(w.ticker, w.hlRank);
  const queueBy = new Map(hl.queue.map((q) => [q.ticker, q])), illBy = new Map((hl.queueIlliquid ?? []).map((q) => [q.ticker, q])), exitBy = new Map(hl.changes.exits.map((x) => [x.ticker, x]));
  const multi: string[] = [];
  for (const [t, set] of seen) {
    const primary = PRIMARY_ORDER.find((s) => set.has(s))!;
    const secondary: string[] = [];
    for (const s of PRIMARY_ORDER) if (s !== primary && set.has(s)) secondary.push(PRIMARY_VI[s]);
    const pz = pzOf.get(t) ?? null;
    if (pz && primary !== "WATCH_BASE" && (pz === "EXTENDED" || pz === "COOLING" || pz === "REBASING") && !secondary.includes(PRIMARY_VI.WATCH_BASE)) secondary.push(PZ_VI[pz]);
    if (set.size > 1) multi.push(t);
    const detail = primary === "QUEUE" ? queueBy.get(t)?.reasonVi ?? null : primary === "BLOCKED" ? illBy.get(t)?.reasonVi ?? null : primary === "EXITED_TODAY" ? exitBy.get(t)?.reasonVi ?? null : pz ? PZ_VI[pz] : null;
    byTicker.set(t, { ticker: t, primary, secondary, rank: rankOf.get(t) ?? null, detail, pz });
    counts[primary]++;
  }
  return { byTicker, counts, multi: multi.sort() };
}

// ---------- transitionsFrom ----------
export interface HistSessionLite { date: string; held: { t: string }[]; added: string[]; exits: { t: string; reasonVi: string | null }[]; queue?: { t: string; code: string | null }[]; ill?: string[] }
export interface WatchLogEntry { ticker: string; date: string; from: string | null; to: string; reasonVi: string | null; held?: boolean }
export interface Transition { date: string; kind: "ENTER" | "EXIT" | "QUEUE" | "BLOCKED" | "PZ"; label: string; reason: string | null }

/** Chuỗi chuyển trạng thái của một mã (cũ -> mới), chỉ từ dữ liệu đã khoá. `queue` / `ill` có từ hl-history HL-H2. */
export function transitionsFrom(ticker: string, sessions: HistSessionLite[] | null | undefined, log: WatchLogEntry[] | null | undefined, limit = 4): Transition[] {
  const t = ticker.toUpperCase(), out: Transition[] = [];
  let prevSlot: string | null = null;
  for (const s of [...(sessions ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    const ex = s.exits.find((x) => x.t === t);
    if (ex) out.push({ date: s.date, kind: "EXIT", label: "Ra khỏi danh mục", reason: ex.reasonVi });
    if (s.added.includes(t)) out.push({ date: s.date, kind: "ENTER", label: prevSlot === "QUEUE" ? "Hàng chờ → Danh mục" : "Vào danh mục", reason: null });
    // Trước LQ1 (18/11/2026) Gateway để mã chưa giao dịch được NGAY TRONG hàng chờ với code "illiquid" -> đọc như "Chưa giao dịch được".
    const q0 = s.queue?.find((q) => q.t === t), oldIll = q0?.code === "illiquid";
    const inQueue = oldIll ? undefined : q0, inIll = oldIll || s.ill?.includes(t), held = s.held.some((h) => h.t === t);
    const slot = held ? "HELD" : inQueue ? "QUEUE" : inIll ? "BLOCKED" : null;
    if (slot === "QUEUE" && prevSlot !== "QUEUE") out.push({ date: s.date, kind: "QUEUE", label: "Vào hàng chờ", reason: inQueue?.code ? QUEUE_CODE_VI[inQueue.code] ?? inQueue.code : null });
    if (slot === "BLOCKED" && prevSlot !== "BLOCKED") out.push({ date: s.date, kind: "BLOCKED", label: "Chưa giao dịch được", reason: null });
    if (s.queue || s.ill || held) prevSlot = slot;
  }
  for (const e of log ?? []) if (e.ticker === t) out.push({ date: e.date, kind: "PZ", label: `${e.from ? PZ_VI[e.from as PzState] ?? e.from : "—"} → ${PZ_VI[e.to as PzState] ?? e.to}`, reason: e.reasonVi });
  const order = { EXIT: 0, QUEUE: 1, BLOCKED: 1, PZ: 2, ENTER: 3 } as const;
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]).slice(-limit);
}
