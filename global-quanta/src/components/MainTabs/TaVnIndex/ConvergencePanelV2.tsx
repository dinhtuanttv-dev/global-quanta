// Bộ lọc Hợp lưu v2 (H2) — danh sách từ Gateway (chiến lược "convergence"), cùng khuôn với bộ lọc CAN SLIM / Base Breakout:
// lọc theo phía / trạng thái / pha, toàn bộ kết quả (không cắt 20), thời điểm quét, thẻ bằng chứng; bấm mã hoặc nhấn đúp dòng
// -> bảng phụ phân tích chuyên sâu (không mở biểu đồ), bấm lại / Esc -> đóng.
// Kiểm định đặt trước (PR #53): EXPERIMENTAL — danh sách để XEM XÉT, không phải tín hiệu mua.
// Theo dõi thực tế (H4): mỗi phiên ghi sổ SCR_CV_{BUY|SELL}_{READY|WATCH}, researchEvaluate chấm T+5 / T+10 so với VN-Index.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, GitMerge, Info, RefreshCw } from "lucide-react";
import { useConvergenceV2, type ConvergenceRow } from "../../../hooks/useConvergenceV2";
import type { TechnicalFilterEvidence } from "../../../hooks/useTechnicalFilter";
import EvidenceCard from "./EvidenceCard";
import ConvergenceDeepPanel from "./ConvergenceDeepPanel";

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  C: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const KIND_SHORT: Record<string, string> = { wyckoff: "W", ob: "OB", fvg: "FVG", poc: "POC", avwap: "VWAP" };
const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtPct = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");

type Side = "all" | "buy" | "sell";
type Status = "all" | "READY" | "WATCH";
const PHASES = ["A", "B", "C", "D", "E"] as const;

function Chip<T extends string>({ value, current, onChange, children, testId }: { value: T; current: T; onChange: (v: T) => void; children: React.ReactNode; testId?: string }) {
  const on = value === current;
  return (
    <button type="button" onClick={() => onChange(value)} aria-pressed={on} data-testid={testId}
      className={`text-[9px] px-2 py-0.5 rounded-full border transition ${on ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
      {children}
    </button>
  );
}

function DeepRow({ children, width }: { children: React.ReactNode; width: number | null }) {
  const ref = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.previousElementSibling?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <tr ref={ref} className="border-b border-cyan-900/40" data-testid="convergence-deep-row">
      <td colSpan={7} className="p-0">
        <div style={width ? { width, position: "sticky", left: 0 } : undefined}>{children}</div>
      </td>
    </tr>
  );
}

export default function ConvergencePanelV2({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const { data, error, isLoading, refresh } = useConvergenceV2();
  const [side, setSide] = useState<Side>("all");
  const [status, setStatus] = useState<Status>("all");
  const [phase, setPhase] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);
  const toggle = useCallback((t: string) => setOpen((cur) => (cur === t ? null : t)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rows = useMemo(() => (data?.results ?? []).filter((r) =>
    (side === "all" || r.side === side) && (status === "all" || r.status === status) && (phase === "all" || r.wyckoff.cyclePhase === phase)), [data, side, status, phase]);
  const counts = useMemo(() => {
    const all = data?.results ?? [];
    return { buy: all.filter((r) => r.side === "buy").length, sell: all.filter((r) => r.side === "sell").length, ready: all.filter((r) => r.status === "READY").length };
  }, [data]);

  return (
    <section style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(6,182,212,0.25)" }} className="rounded-xl p-3 space-y-2.5" aria-label="Bộ lọc Hợp lưu v2" data-testid="convergence-v2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <GitMerge className="w-3 h-3 text-cyan-400" /> Bộ lọc Hợp lưu v2
          <span className="hidden sm:inline normal-case font-normal text-slate-500">· Wyckoff · vùng giá · effort · RS · 9 phép thử · thanh khoản</span>
        </h2>
        <button type="button" onClick={() => void refresh()} aria-label="Làm mới bộ lọc Hợp lưu" className="text-slate-400 hover:text-slate-200">
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <p className="text-[9px] text-slate-500 leading-relaxed flex flex-wrap items-start gap-x-1 gap-y-0.5">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        <span className="flex-1 min-w-[14rem]">
          Chỉ mã có cấu trúc Wyckoff ĐANG HOẠT ĐỘNG; mọi thành phần tính CÙNG CHIỀU với Wyckoff. Trọng số đặt trước, chưa có lợi thế đã kiểm định —
          danh sách để xem xét, không phải tín hiệu mua. {data?.disclaimer}
        </span>
        {data && <span className="w-full sm:w-auto sm:ml-auto text-slate-400" data-testid="convergence-asof">Gateway · phiên {data.dataAsOf} · quét {fmtTime(data.generatedAt)} · {data.resultCount}/{data.scannedCount} mã</span>}
      </p>
      {data?.evidence && (data.evidence.label === "PENDING"
        ? <p className="text-[9px] text-amber-300/80 rounded-lg border border-slate-800/70 bg-slate-950/40 p-2" data-testid="evidence-pending">Bằng chứng lịch sử: {data.evidence.reason}</p>
        : <EvidenceCard evidence={data.evidence as TechnicalFilterEvidence} marketUp={data.market?.up} live={data.liveTracking} />)}

      {data && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="convergence-filters">
          <Chip value="all" current={side} onChange={setSide}>Tất cả {data.resultCount}</Chip>
          <Chip value="buy" current={side} onChange={setSide} testId="filter-buy">▲ Phía mua {counts.buy}</Chip>
          <Chip value="sell" current={side} onChange={setSide} testId="filter-sell">▼ Phía bán {counts.sell}</Chip>
          <span className="w-px h-3 bg-slate-700 mx-1" />
          <Chip value="all" current={status} onChange={setStatus}>Mọi trạng thái</Chip>
          <Chip value="READY" current={status} onChange={setStatus} testId="filter-ready">READY {counts.ready}</Chip>
          <Chip value="WATCH" current={status} onChange={setStatus}>Theo dõi</Chip>
          <span className="w-px h-3 bg-slate-700 mx-1" />
          <Chip value="all" current={phase} onChange={setPhase}>Mọi pha</Chip>
          {PHASES.map((p) => <Chip key={p} value={p} current={phase} onChange={setPhase} testId={`filter-phase-${p}`}>Phase {p}</Chip>)}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-1.5 text-[10px] text-red-300 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Không tải được bộ lọc Hợp lưu: {error.message}
        </div>
      )}
      {isLoading && !data && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-5">
          <RefreshCw className="w-3 h-3 animate-spin" /> Đang tải kết quả quét Hợp lưu từ Gateway…
        </div>
      )}
      {data && rows.length === 0 && <p className="text-[10px] text-slate-500 italic py-4 text-center">Không có mã nào khớp bộ lọc đang chọn.</p>}

      {rows.length > 0 && (
        <div ref={scrollRef} className={open ? "overflow-x-auto" : "max-h-80 overflow-auto"}>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Phía · pha</th>
                <th className="py-1.5 text-right pr-1">Điểm</th>
                <th className="py-1.5 pl-3">Hợp lưu vùng giá</th>
                <th className="py-1.5 text-right hidden sm:table-cell">9 phép thử</th>
                <th className="py-1.5 text-right hidden sm:table-cell">Giá</th>
                <th className="py-1.5 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {rows.map((r: ConvergenceRow) => (
                <Fragment key={r.ticker}>
                  <tr className={`transition cursor-pointer select-none ${open === r.ticker ? "bg-cyan-500/10" : "hover:bg-slate-800/30"}`}
                    onDoubleClick={() => toggle(r.ticker)} aria-expanded={open === r.ticker} data-testid="convergence-row">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(r.ticker)} onDoubleClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 font-black text-amber-400 hover:text-amber-300"
                        title={`Phân tích chuyên sâu ${r.ticker} (bấm lại hoặc Esc để đóng)`} aria-label={`Phân tích chuyên sâu ${r.ticker}`}>
                        <ChevronRight className={`w-3 h-3 transition-transform ${open === r.ticker ? "rotate-90" : ""}`} />{r.ticker}
                      </button>
                      <span className="block text-[8px] text-slate-600 truncate max-w-[9rem]">{r.sector ?? "—"}</span>
                    </td>
                    <td className="py-1.5">
                      <span className={r.side === "buy" ? "text-emerald-300" : "text-rose-300"}>{r.side === "buy" ? "▲ Mua" : "▼ Bán"}</span>
                      <span className="text-violet-300"> · Phase {r.wyckoff.cyclePhase ?? "?"}</span>
                      {r.wyckoff.tranche && <span className="block text-[8px] text-slate-500">lần {r.wyckoff.tranche.n} khớp {r.wyckoff.tranche.date?.slice(5).split("-").reverse().join("/")}</span>}
                    </td>
                    <td className="py-1.5 text-right" title={r.components.map((c) => `${c.label}: ${c.points}/${c.max}`).join("\n")}>
                      <span className="font-mono font-bold text-slate-200">{r.metrics.score}</span>
                      <span className={`ml-1 text-[8px] px-1 py-0.5 rounded border font-black ${GRADE_STYLE[r.grade]}`}>{r.grade}</span>
                    </td>
                    <td className="py-1.5 pl-3">
                      {r.zone ? (
                        <>
                          {/* Hợp lưu thật = ≥ 2 loại mức trùng nhau; 1 loại chỉ là một mức giá gần giá. */}
                          <span className={r.zone.kinds.length >= 2 ? "text-amber-200 font-semibold" : "text-slate-400"}>
                            {r.zone.kinds.map((k) => KIND_SHORT[k] ?? k).join(" + ")}{r.zone.kinds.length < 2 ? " · 1 mức" : ""}
                          </span>
                          <span className="block text-[8px] text-slate-500 font-mono">
                            {Math.round(r.zone.low) === Math.round(r.zone.high) ? fmtP(r.zone.low) : `${fmtP(r.zone.low)}–${fmtP(r.zone.high)}`} · {fmtPct(r.zone.distancePct)}
                          </span>
                        </>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-1.5 text-right text-slate-300 hidden sm:table-cell">{r.wyckoff.testsPassed != null ? `${r.wyckoff.testsPassed}/${r.wyckoff.testsAvail}` : "—"}</td>
                    <td className="py-1.5 text-right font-mono text-slate-300 hidden sm:table-cell">{fmtP(r.metrics.close)}</td>
                    <td className="py-1.5 text-right">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${r.status === "READY" ? "bg-amber-500/15 text-amber-200" : "bg-slate-500/10 text-slate-400"}`}>
                        {r.status === "READY" ? "READY" : "Theo dõi"}
                      </span>
                    </td>
                  </tr>
                  {open === r.ticker && data && (
                    <DeepRow width={frameW}>
                      <ConvergenceDeepPanel row={r} doc={data} onClose={() => setOpen(null)} onOpenChart={onSelectTicker} />
                    </DeepRow>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
