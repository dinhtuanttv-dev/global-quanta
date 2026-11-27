// BUỒNG LÁI CHỈ HUY (20/11/2026, docs/elite-hl-cockpit 06, C1–C5) — các khối CHỈ THÊM trên Bảng quyết định Elite HL.
// Mọi phần tử mang data-hl-layer="cockpit" (test vân tay toàn bảng gỡ chúng ra và so với bảng gốc từng ký tự). Chỉ diễn giải dữ liệu
// đã có (tài liệu quyết định, hl-history, nhật ký PZ /api/elite/hl/watch/log); không đổi danh mục, thứ tự hay ngưỡng. MÔ TẢ.
//  - CockpitStatusBar (C1): phiên, khoá, phiên bản, chế độ PZ, chốt dữ liệu, nguồn phụ lệch phiên, đếm theo trạng thái chính,
//    số chuyển trạng thái trong phiên (cảnh báo một lần cho mỗi bản dựng).
//  - FunnelNotes (C2) đã gỡ 27/11/2026 theo chủ dự án (ít tác dụng, chật giao diện); cảnh báo phễu không nhất quán chuyển vào bảng chính.
//  - StateMap (C3–C4): mỗi mã đúng một trạng thái chính (D1) + nhãn phụ; bấm ô -> chuỗi chuyển trạng thái + mở Hồ sơ.
//  - HlBreadcrumb (C4): hai bước chuyển gần nhất ngay dưới mã ở bảng danh mục.
//  - QueueMatrix (C5): hàng chờ dạng ma trận (mở khi cần); dạng thẻ hiện có giữ nguyên.
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import { hlCadenceVi } from "../../../lib/elite10/hlCadence";
import {
  PRIMARY_ORDER, PRIMARY_VI, QUEUE_CODE_VI, PZ_VI, transitionsFrom,
  type BoardStates, type HistSessionLite, type PrimaryState, type SessionSeal, type Transition, type WatchLogEntry,
} from "../../../lib/elite10/cockpit";

const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const hm = (iso: string | null | undefined) => { if (!iso) return "—"; const v = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return v.slice(11, 16); };
const reduceMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Nhật ký chuyển trạng thái PZ (đã có trên Gateway, chưa giao diện nào dùng trước buồng lái). */
export function useHlWatchLog(enabled: boolean) {
  return useSWR<{ entries: WatchLogEntry[] }>(enabled && isMarketGatewayEnabled() ? "elite-hl-watch-log" : null,
    () => fetchMarketJson<{ entries: WatchLogEntry[] }>("/api/elite/hl/watch/log"), { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 });
}

const TONE: Record<PrimaryState, string> = {
  PORTFOLIO_CORE: "border-emerald-400/50 text-emerald-200", PORTFOLIO_RUNNER: "border-violet-400/50 text-violet-200", EXITED_TODAY: "border-rose-400/50 text-rose-200",
  QUEUE: "border-[#E8B84B]/50 text-[#F5CE72]", BLOCKED: "border-slate-400/50 text-slate-300", WATCH_BASE: "border-cyan-400/40 text-cyan-200", SECTOR_AGAINST: "border-amber-500/40 text-amber-300",
};
const KIND_TONE: Record<Transition["kind"], string> = { ENTER: "text-emerald-300", EXIT: "text-rose-300", QUEUE: "text-[#F5CE72]", BLOCKED: "text-slate-300", PZ: "text-cyan-200" };

/** Mọi chuyển trạng thái xảy ra ĐÚNG phiên đang xem (để cảnh báo). */
export function todayTransitions(states: BoardStates, d: EliteDecision, sessions: HistSessionLite[] | undefined, log: WatchLogEntry[] | undefined) {
  const out: { ticker: string; t: Transition }[] = [];
  for (const tk of states.byTicker.keys()) for (const t of transitionsFrom(tk, sessions, log, 20)) if (t.date === d.date) out.push({ ticker: tk, t });
  return out;
}

/** Cảnh báo chuyển trạng thái chỉ một lần cho mỗi bản dựng (phiên + thời điểm khoá), nhớ theo trình duyệt. */
const SEEN_KEY = "gq.hl.cockpitSeen.v1";
export function useFreshFlag(key: string, has: boolean): boolean {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!has) return;
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(SEEN_KEY); } catch { /* */ }
    if (seen === key) return;
    setFresh(true);
    try { window.localStorage.setItem(SEEN_KEY, key); } catch { /* */ }
    if (reduceMotion()) return;
    const id = setTimeout(() => setFresh(false), 1200);
    return () => clearTimeout(id);
  }, [key, has]);
  return fresh;
}

export function CockpitStatusBar({ seal, states, today }: { seal: SessionSeal; states: BoardStates; today: { ticker: string; t: Transition }[] }) {
  const fresh = useFreshFlag(`${seal.date}|${seal.builtAt}`, today.length > 0);
  const lag = seal.sources.filter((s) => s.lag);
  const c = states.counts;
  return (
    <section className={`rounded-lg border bg-[#0E131F] px-3 py-2 text-[11px] transition-shadow ${fresh ? "border-[#E8B84B]/70 shadow-[0_0_0_2px_rgba(232,184,75,0.35)]" : "border-white/10"}`} data-hl-layer="cockpit" data-testid="cockpit-status">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-[#F5CE72]">PHIÊN {dm(seal.date)}</b>
        <span className="text-slate-300">khoá {hm(seal.builtAt)}</span>
        <span className="text-slate-400">· {seal.version}{seal.ruleVersion ? ` · ${seal.ruleVersion}` : ""}</span>
        {seal.pzMode && <span className="rounded border border-white/15 px-1 text-[10px] text-slate-300">{seal.pzMode === "GATE" ? "PZ-v2 CỔNG BẬT" : "PZ-v2 CHỈ HIỂN THỊ"}</span>}
        <span className="rounded border border-amber-400/40 px-1 text-[10px] font-bold text-amber-200">THĂM DÒ</span>
        <span className="text-slate-400">· {seal.rebalance ? hlCadenceVi(seal.version).session : `không phải phiên vào lệnh — mua mới chờ ${hlCadenceVi(seal.version).next}`}</span>
      </p>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-slate-400" data-testid="cockpit-data">
        {seal.frozen ? <b className="text-rose-300">● Chốt dữ liệu: {seal.frozenWhy.join(" · ")}</b> : <span><span className="text-emerald-300">●</span> Dữ liệu phiên đủ nguồn</span>}
        {seal.sessionsBehind != null && seal.sessionsBehind > 0 && <b className="text-rose-300">· bảng chậm {seal.sessionsBehind} phiên</b>}
        {seal.sources.map((s) => <span key={s.key} data-testid={`cockpit-src-${s.key}`} className={s.lag ? "text-amber-300" : ""}>· {s.label} {s.date ? dm(s.date) : "—"}{s.lag ? " (lệch phiên)" : ""}</span>)}
        {lag.length === 0 && seal.sources.length > 0 && <span>· mọi nguồn cùng phiên</span>}
      </p>
      <p className="mt-0.5 flex flex-wrap gap-x-2" data-testid="cockpit-counts">
        {PRIMARY_ORDER.filter((s) => c[s] > 0).map((s) => <span key={s}><span className="text-slate-400">{PRIMARY_VI[s]}</span> <b className="text-slate-100">{c[s]}</b></span>)}
        {states.multi.length > 0 && <span className="text-slate-500" title="Mã có mặt ở nhiều danh sách: hiển thị một trạng thái chính (thứ tự D1) và nhãn phụ">· {states.multi.length} mã ở nhiều danh sách</span>}
      </p>
      {today.length > 0 && (
        <p className="mt-0.5 text-[#F5CE72]" data-testid="cockpit-today">
          Chuyển trạng thái phiên này ({today.length}): {today.slice(0, 6).map((x) => `${x.ticker} ${x.t.label}`).join(" · ")}{today.length > 6 ? " · …" : ""}
        </p>
      )}
    </section>
  );
}

/** Mã thuộc lựa chọn đánh dấu (mã lý do hàng chờ / ra / chưa giao dịch được). */
export function pickedTickers(d: EliteDecision, picked: string | null): Set<string> {
  if (!picked || !d.hl) return new Set();
  if (picked === "blocked") return new Set((d.hl.queueIlliquid ?? []).map((q) => q.ticker));
  const [kind, code] = picked.split(":");
  if (kind === "q") return new Set(d.hl.queue.filter((q) => String(q.code) === code).map((q) => q.ticker));
  if (kind === "x") return new Set(d.hl.changes.exits.filter((x) => x.code === code).map((x) => x.ticker));
  return new Set();
}

export function TransitionList({ tr, testId }: { tr: Transition[]; testId?: string }) {
  if (!tr.length) return <p className="text-[10px] text-slate-500" data-testid={testId}>Chưa có chuyển trạng thái trong các phiên đã lưu.</p>;
  return (
    <ol className="space-y-0.5 text-[10.5px]" data-testid={testId}>
      {tr.map((x, i) => <li key={i}><span className="font-mono text-slate-500">{dm(x.date)}</span> <b className={KIND_TONE[x.kind]}>{x.label}</b>{x.reason ? <span className="text-slate-400"> — {x.reason}</span> : null}</li>)}
    </ol>
  );
}

export function StateMap({ states, sessions, log, highlight, today, onOpenTicker }: {
  states: BoardStates; sessions: HistSessionLite[] | undefined; log: WatchLogEntry[] | undefined; highlight: Set<string>; today: Set<string>; onOpenTicker: (t: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cols = useMemo(() => PRIMARY_ORDER.map((s) => ({ s, items: [...states.byTicker.values()].filter((x) => x.primary === s).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)) })).filter((c) => c.items.length), [states]);
  const sel = open ? states.byTicker.get(open) ?? null : null;
  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3" data-hl-layer="cockpit" data-testid="cockpit-map">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">Bản đồ trạng thái</h4>
        <span className="text-[10px] text-slate-500">mỗi mã một trạng thái chính · Danh mục &gt; Vừa ra &gt; Hàng chờ &gt; Chưa giao dịch được &gt; Chờ nền &gt; Ngành phản đối · MÔ TẢ</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {cols.map(({ s, items }) => (
          <div key={s} data-testid={`cockpit-col-${s}`}>
            <p className="mb-0.5 text-[10px] font-bold uppercase text-slate-500">{PRIMARY_VI[s]} · {items.length}</p>
            <ul className="flex flex-wrap gap-1">
              {items.map((x) => (
                <li key={x.ticker}>
                  <button type="button" aria-expanded={open === x.ticker} onClick={() => setOpen(open === x.ticker ? null : x.ticker)} data-testid={`cockpit-cell-${x.ticker}`}
                    title={[x.detail, ...x.secondary.map((y) => `cũng ở: ${y}`)].filter(Boolean).join(" · ")}
                    className={`min-h-[26px] rounded border px-1.5 text-left text-[10.5px] ${TONE[s]} ${highlight.has(x.ticker) ? "bg-[#E8B84B]/20 ring-1 ring-[#E8B84B]/70" : ""} ${today.has(x.ticker) ? "border-dashed" : ""}`}>
                    <b className="font-mono">{x.ticker}</b>{x.rank != null && <span className="ml-1 text-[10px] text-slate-500">#{x.rank}</span>}
                    {x.secondary.length > 0 && <span className="ml-1 text-[10px] text-slate-400">+{x.secondary.join(", ")}</span>}
                    {today.has(x.ticker) && <span className="ml-1 text-[10px] text-[#F5CE72]" title="Có chuyển trạng thái (danh mục / hàng chờ / vị trí giá) trong phiên đang xem">đổi phiên này</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {sel && (
        <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2" data-testid="cockpit-detail">
          <p className="flex flex-wrap items-center gap-2 text-[11px]"><b className="font-mono text-slate-100">{sel.ticker}</b>
            <span className={`rounded border px-1 text-[10px] ${TONE[sel.primary]}`}>{PRIMARY_VI[sel.primary]}</span>
            {sel.detail && <span className="text-slate-400">{sel.detail}</span>}
            {sel.secondary.length > 0 && <span className="text-slate-500">· cũng ở: {sel.secondary.join(", ")}</span>}
            <button type="button" onClick={() => onOpenTicker(sel.ticker)} className="ml-auto min-h-[24px] rounded border border-white/15 px-2 text-[10px] text-slate-300 hover:text-[#F5CE72]">Mở Hồ sơ 360° →</button>
          </p>
          <div className="mt-1"><TransitionList tr={transitionsFrom(sel.ticker, sessions, log, 6)} testId="cockpit-detail-tr" /></div>
        </div>
      )}
    </section>
  );
}

export function HlBreadcrumb({ ticker, sessions, log }: { ticker: string; sessions: HistSessionLite[] | undefined; log: WatchLogEntry[] | undefined }) {
  const tr = transitionsFrom(ticker, sessions, log, 2);
  if (!tr.length) return null;
  return (
    <span className="mt-0.5 block text-[10px] text-slate-400" data-hl-layer="cockpit" data-testid={`cockpit-crumb-${ticker}`} title={tr.map((x) => `${dm(x.date)} ${x.label}${x.reason ? ` — ${x.reason}` : ""}`).join("\n")}>
      {tr.map((x, i) => <span key={i}>{i ? " → " : ""}<span className={KIND_TONE[x.kind]}>{x.label}</span> {dm(x.date)}</span>)}
    </span>
  );
}

export function QueueMatrix({ d, states, secName }: { d: EliteDecision; states: BoardStates; secName: (k: string | null | undefined) => string }) {
  const [open, setOpen] = useState<boolean>(() => { try { return window.localStorage.getItem("gq.hl.queueMatrix.v1") === "1"; } catch { return false; } });
  const toggle = () => setOpen((v) => { try { window.localStorage.setItem("gq.hl.queueMatrix.v1", v ? "0" : "1"); } catch { /* */ } return !v; });
  const hl = d.hl; if (!hl || (!hl.queue.length && !(hl.queueIlliquid ?? []).length)) return null;
  const heldBySec = new Map<string, number>(); for (const s of hl.sectors) heldBySec.set(s.sectorKey, s.names);
  const row = (q: typeof hl.queue[number], i: number | null) => {
    const st = states.byTicker.get(q.ticker);
    return (
      <tr key={q.ticker} className="border-t border-white/5" data-testid={`cockpit-qm-${q.ticker}`}>
        <td className="py-1 pr-2 font-mono text-slate-500">{i ?? "—"}</td>
        <td className="sticky left-0 bg-[#0E131F] pr-2 font-mono font-bold text-[#F5CE72]">{q.ticker}</td>
        <td className="pr-2">{QUEUE_CODE_VI[String(q.code)] ?? q.reasonVi}</td>
        <td className="pr-2 text-slate-400">{secName(q.sectorKey)} · giữ {heldBySec.get(q.sectorKey ?? "") ?? 0}/{hl.rule.maxPerSector}</td>
        <td className="pr-2 font-mono">{q.lsPct == null ? "—" : Math.round(q.lsPct)}</td>
        <td className="pr-2 font-mono">{q.taCount}</td>
        <td className="pr-2">{q.rrg == null ? "—" : q.rrg > 0 ? "ủng hộ" : "phản đối"}</td>
        <td className="pr-2 font-mono">{q.advBn == null ? "—" : `${q.advBn.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`}</td>
        <td>{q.pz ? PZ_VI[q.pz.state] : "—"}{st && st.secondary.length ? <span className="ml-1 text-[10px] text-cyan-200">(+{st.secondary.join(", ")})</span> : null}</td>
      </tr>
    );
  };
  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 text-[11px]" data-hl-layer="cockpit" data-testid="cockpit-queue-matrix">
      <button type="button" aria-expanded={open} onClick={toggle} data-testid="cockpit-qm-toggle" className="min-h-[24px] font-bold text-[#F5CE72] hover:underline">
        {open ? "▾" : "▸"} Hàng chờ dạng ma trận ({hl.queue.length} mã{(hl.queueIlliquid ?? []).length ? ` + ${(hl.queueIlliquid ?? []).length} chưa giao dịch được` : ""}) — dạng thẻ ở trên giữ nguyên
      </button>
      {open && (
        <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="mt-1 overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 pr-2 font-normal">#</th><th className="sticky left-0 bg-[#0E131F] pr-2 font-normal">Mã</th><th className="pr-2 font-normal">Lý do chờ</th><th className="pr-2 font-normal">Ngành · đang giữ / trần</th><th className="pr-2 font-normal">LS-v1</th><th className="pr-2 font-normal">TA</th><th className="pr-2 font-normal">RRG</th><th className="pr-2 font-normal">GTGD TB20</th><th className="font-normal">Vị trí giá PZ</th></tr></thead>
            <tbody>
              {hl.queue.map((q, i) => row(q, i + 1))}
              {(hl.queueIlliquid ?? []).length > 0 && <tr><td colSpan={9} className="pt-2 text-[10px] font-bold uppercase text-slate-500">Chưa giao dịch được — không xếp thứ tự thay thế</td></tr>}
              {(hl.queueIlliquid ?? []).map((q) => row(q, null))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
