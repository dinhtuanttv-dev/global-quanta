// Pattern Scanner v2 (Martin Pring) — danh sách từ Gateway (chiến lược "patterns", engine pring/P4), thay Pattern Scanner cũ của Project A.
// Lọc theo hướng / trạng thái / khung / họ mô hình; xếp theo TRẠNG THÁI (kiểm định P3: điểm không xếp hạng được); bấm mã hoặc nhấn đúp
// dòng -> bảng phụ phân tích chuyên sâu (không mở biểu đồ), bấm lại / Esc -> đóng. Kiểm định đặt trước P3: EXPERIMENTAL.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Info, RefreshCw, Shapes } from "lucide-react";
import { STATE_GROUP, usePatterns, type PatternRow, type PatternSummary } from "../../../hooks/usePatterns";
import PatternDeepPanel, { STATE_STYLE } from "./PatternDeepPanel";

const fmtN = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");
type DirF = "all" | "bull" | "bear";
type StateF = "active" | "forming" | "target" | "failed" | "all";
type TfF = "all" | "D" | "W";
const STATE_F: { key: StateF; label: string }[] = [
  { key: "active", label: "Đang hiệu lực" }, { key: "forming", label: "Đang hình thành" }, { key: "target", label: "Đạt mục tiêu" }, { key: "failed", label: "Thất bại" }, { key: "all", label: "Tất cả" },
];
const FAMILY_VI: Record<string, string> = { double: "Đôi/ba", hs: "Vai-đầu-vai", rect: "Chữ nhật", triangle: "Tam giác", wedge: "Nêm", broadening: "Mở rộng", flag: "Cờ", rounding: "Tròn/cốc", island: "Đảo" };
const VERDICT_VI: Record<string, string> = { PASS: "ĐẠT", FAIL: "KHÔNG ĐẠT", INSUFFICIENT: "THIẾU MẪU" };

function Chip<T extends string>({ value, current, onChange, children, testId }: { value: T; current: T; onChange: (v: T) => void; children: React.ReactNode; testId?: string }) {
  const on = value === current;
  return (
    <button type="button" onClick={() => onChange(value)} aria-pressed={on} data-testid={testId}
      className={`text-[9px] px-2 py-0.5 rounded-full border transition ${on ? "border-violet-500/50 bg-violet-500/10 text-violet-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
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
    <tr ref={ref} className="border-b border-violet-900/40" data-testid="pattern-deep-row">
      <td colSpan={7} className="p-0"><div style={width ? { width, position: "sticky", left: 0 } : undefined}>{children}</div></td>
    </tr>
  );
}

export default function PatternScannerPanel({ onSelectTicker, onOpenVision }: { onSelectTicker: (ticker: string) => void; onOpenVision?: (ticker: string) => void }) {
  const { data, error, isLoading, refresh } = usePatterns();
  const [dir, setDir] = useState<DirF>("bull");
  const [state, setState] = useState<StateF>("active");
  const [tf, setTf] = useState<TfF>("all");
  const [family, setFamily] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el); setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);
  const toggle = useCallback((t: string) => setOpen((cur) => (cur === t ? null : t)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const match = useCallback((p: PatternSummary) => (dir === "all" || p.dir === dir) && (state === "all" || STATE_GROUP[p.state] === state)
    && (tf === "all" || p.timeframe === tf) && (family === "all" || p.family === family), [dir, state, tf, family]);
  // mỗi mã: mô hình đầu tiên (theo thứ tự trạng thái của Gateway) khớp bộ lọc
  const rows = useMemo(() => (data?.results ?? []).map((r) => ({ r, p: r.patterns.find(match) })).filter((x): x is { r: PatternRow; p: PatternSummary } => !!x.p), [data, match]);
  const famCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.results ?? []) for (const p of r.patterns) if ((dir === "all" || p.dir === dir) && (state === "all" || STATE_GROUP[p.state] === state) && (tf === "all" || p.timeframe === tf)) m.set(p.family, (m.get(p.family) ?? 0) + 1);
    return m;
  }, [data, dir, state, tf]);
  const v = data?.evidence?.validation;
  const live = data?.liveTracking?.groups ?? [];

  return (
    <section style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(139,92,246,0.28)" }} className="rounded-xl p-3 space-y-2.5" aria-label="Pattern Scanner v2" data-testid="pattern-panel">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Shapes className="w-3 h-3 text-violet-400" /> Pattern Scanner v2
          <span className="hidden sm:inline normal-case font-normal text-slate-500">· mô hình giá Martin Pring · ngày & tuần · vòng đời · mục tiêu · thất bại</span>
        </h2>
        <button type="button" onClick={() => void refresh()} aria-label="Làm mới Pattern Scanner" className="text-slate-400 hover:text-slate-200">
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <p className="text-[9px] text-slate-500 leading-relaxed flex flex-wrap items-start gap-x-1 gap-y-0.5">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        <span className="flex-1 min-w-[14rem]">
          Theo "Martin Pring on Price Patterns" (ch1–17): đỉnh/đáy đôi–ba, vai-đầu-vai, chữ nhật, tam giác, nêm, mở rộng, cờ, đáy/đỉnh tròn, cốc tay cầm, đảo.
          Chỉ báo mô hình còn "tươi": đang hình thành gần điểm phá vỡ hoặc vừa có sự kiện. Xếp theo trạng thái. {data?.disclaimer}
        </span>
        {data && <span className="w-full sm:w-auto sm:ml-auto text-slate-400" data-testid="pattern-asof">Gateway · phiên {data.dataAsOf} · quét {fmtTime(data.generatedAt)} · {data.resultCount}/{data.scannedCount} mã</span>}
      </p>

      {v && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 space-y-1" data-testid="pattern-evidence">
          <div className="flex flex-wrap items-center gap-2 text-[9.5px]">
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-500/15 text-amber-300">{v.label}</span>
            <span className="text-slate-300">Kiểm định đặt trước P3 · {v.period.symbols} mã · {v.period.from} → {v.period.to} · ngoài mẫu từ {v.period.oosFrom}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 text-[9px]">
            {Object.entries(v.H1).map(([k, g]) => (
              <div key={k} className="rounded border border-slate-800 px-1.5 py-1">
                <div className="flex justify-between gap-1"><span className="text-slate-400 truncate">{k} · {g.label.split(" (")[0]}</span><span className={g.verdict === "PASS" ? "text-emerald-300 font-bold" : "text-rose-300 font-bold"}>{VERDICT_VI[g.verdict]}</span></div>
                <div className="font-mono text-slate-300">OOS n {g.oos.n} · {g.oos.mean != null ? `${g.oos.mean >= 0 ? "+" : ""}${fmtN(g.oos.mean, 2)}%` : "—"}</div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-400">{v.conclusion}</p>
        </div>
      )}
      {data && (
        <p className="text-[9px] text-slate-500" data-testid="pattern-live">
          Theo dõi thực tế (sổ SCR_PAT_BUY / _SELL / _W_BUY / _W_SELL, ghi mỗi phiên quét 15:45 khi mô hình được xác nhận, chấm T+3/T+5/T+10 so với VN-Index):{" "}
          {live.some((g) => g.h5) ? live.map((g) => g.h5 ? `${g.label} T+5: n ${g.h5.n}, trúng ${Math.round(g.h5.hitRate * 100)}% (nền ${Math.round(g.h5.baseline * 100)}%)` : `${g.label}: chưa đủ mẫu`).join(" · ") : "chưa có tín hiệu đủ T+5."}
        </p>
      )}

      {data && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="pattern-filters">
          <Chip value="bull" current={dir} onChange={setDir} testId="pattern-dir-bull">Tăng</Chip>
          <Chip value="bear" current={dir} onChange={setDir} testId="pattern-dir-bear">Giảm</Chip>
          <Chip value="all" current={dir} onChange={setDir}>Hai hướng</Chip>
          <span className="w-px h-3 bg-slate-700 mx-1" />
          {STATE_F.map((s) => <Chip key={s.key} value={s.key} current={state} onChange={setState} testId={`pattern-state-${s.key}`}>{s.label}</Chip>)}
          <span className="w-px h-3 bg-slate-700 mx-1" />
          <Chip value="all" current={tf} onChange={setTf}>Ngày + tuần</Chip>
          <Chip value="D" current={tf} onChange={setTf} testId="pattern-tf-D">Ngày</Chip>
          <Chip value="W" current={tf} onChange={setTf} testId="pattern-tf-W">Tuần</Chip>
          <span className="w-px h-3 bg-slate-700 mx-1" />
          <Chip value="all" current={family} onChange={setFamily}>Mọi họ</Chip>
          {Object.keys(FAMILY_VI).filter((f) => famCounts.has(f)).map((f) => <Chip key={f} value={f} current={family} onChange={setFamily} testId={`pattern-family-${f}`}>{FAMILY_VI[f]} {famCounts.get(f)}</Chip>)}
        </div>
      )}

      {error && <div role="alert" className="flex items-center gap-1.5 text-[10px] text-red-300 py-2"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> Không tải được Pattern Scanner: {error.message}</div>}
      {isLoading && !data && <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-5"><RefreshCw className="w-3 h-3 animate-spin" /> Đang tải kết quả quét mô hình giá từ Gateway…</div>}
      {data && rows.length === 0 && <p className="text-[10px] text-slate-500 italic py-4 text-center">Không có mã nào khớp bộ lọc đang chọn.</p>}

      {rows.length > 0 && data && (
        <div ref={scrollRef} className={open ? "overflow-x-auto" : "max-h-96 overflow-auto"}>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Mô hình</th>
                <th className="py-1.5">Trạng thái</th>
                <th className="py-1.5 text-right hidden sm:table-cell">Tiêu chí</th>
                <th className="py-1.5 text-right">Cách đường PV</th>
                <th className="py-1.5 text-right hidden sm:table-cell">R:R</th>
                <th className="py-1.5 text-right hidden sm:table-cell">Khác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {rows.map(({ r, p }) => (
                <Fragment key={r.ticker}>
                  <tr className={`transition cursor-pointer select-none ${open === r.ticker ? "bg-violet-500/10" : "hover:bg-slate-800/30"}`}
                    onDoubleClick={() => toggle(r.ticker)} aria-expanded={open === r.ticker} data-testid="pattern-row">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(r.ticker)} onDoubleClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 font-black text-amber-400 hover:text-amber-300"
                        title={`Phân tích chuyên sâu ${r.ticker} (bấm lại hoặc Esc để đóng)`} aria-label={`Phân tích chuyên sâu ${r.ticker}`}>
                        <ChevronRight className={`w-3 h-3 transition-transform ${open === r.ticker ? "rotate-90" : ""}`} />{r.ticker}
                      </button>
                      <span className="block text-[8px] text-slate-600 truncate max-w-[9rem]">{r.sector ?? "—"}</span>
                    </td>
                    <td className="py-1.5">
                      <span className={p.dir === "bull" ? "text-emerald-300" : "text-rose-300"}>{p.label}</span>
                      <span className="block text-[8px] text-slate-500">{p.timeframe === "W" ? "Tuần" : "Ngày"} · {p.role === "continuation" ? "tiếp diễn" : "đảo chiều"} · {fmtN(p.heightPct, 0)}%</span>
                    </td>
                    <td className="py-1.5">
                      <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full border font-bold whitespace-nowrap ${STATE_STYLE[p.state]}`}>{p.stateLabel}</span>
                      {p.barWarn.length > 0 && <span className="block text-[7.5px] text-amber-300 mt-0.5">⚠ nến cảnh báo tại phá vỡ</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-slate-300 hidden sm:table-cell" title={`Điểm minh bạch ${p.score} (chưa kiểm định — không dùng để xếp hạng)`}>{p.checksOk}/{p.checksTotal}</td>
                    <td className={`py-1.5 text-right font-mono ${(p.distancePct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{p.distancePct != null ? `${p.distancePct >= 0 ? "+" : ""}${fmtN(p.distancePct, 1)}%` : "—"}</td>
                    <td className={`py-1.5 text-right font-mono hidden sm:table-cell ${(p.plan?.rr ?? 0) >= 3 ? "text-emerald-300" : "text-slate-400"}`}>{fmtN(p.plan?.rr, 1)}</td>
                    <td className="py-1.5 text-right text-slate-500 hidden sm:table-cell">{r.patterns.length > 1 ? `+${r.patterns.length - 1}` : ""}</td>
                  </tr>
                  {open === r.ticker && (
                    <DeepRow width={frameW}><PatternDeepPanel row={{ ...r, patterns: [p, ...r.patterns.filter((x) => x !== p)] }} doc={data} onClose={() => setOpen(null)} onOpenChart={onSelectTicker} onOpenVision={onOpenVision} /></DeepRow>
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
