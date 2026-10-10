// Golden SEPA (SP5) — thay Golden Filter × Top 20 Kỹ thuật (đã gỡ hoàn toàn): SEPA Minervini là lõi, xác nhận chéo bởi CAN SLIM,
// Base Breakout, Hợp lưu v2 (phía mua) và Mô hình giá Pring (P5) — mọi nguồn chạy trên Gateway, cùng universe và chuỗi giá điều chỉnh.
// Bấm mã / nhấn đúp dòng -> bảng phụ SEPA (cùng bảng phụ của tab SEPA), Esc -> đóng. Không có điểm composite tự đặt.
// Sổ theo dõi thực tế: SCR_SEPA_READY / _ALERT / _S2 (researchEvaluate chấm T+3/T+5/T+10 so với VN-Index).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Info, RefreshCw, Star } from "lucide-react";
import { isS2Signal } from "../../../hooks/useSepa";
import { GOLDEN_SOURCES, useGoldenSepa, type GoldenSepaRow } from "../../../hooks/useGoldenSepa";
import SepaIntradayStrip from "./SepaIntradayStrip";
import SepaDeepPanel, { LIST_STYLE, STATUS_VI } from "./SepaDeepPanel";

const CONFIRM_SHORT: Record<string, string> = { camslim: "CS", "base-breakout": "BB", convergence: "HL", patterns: "MH" };
const LIST_SHORT: Record<string, string> = { "SẴN SÀNG MUA": "Sẵn sàng", "CẢNH BÁO MUA": "Cảnh báo", "THEO DÕI": "Theo dõi" };
type MinConfirm = 0 | 1 | 2;

function Chip<T extends string | number>({ value, current, onChange, children, testId }: { value: T; current: T; onChange: (v: T) => void; children: React.ReactNode; testId?: string }) {
  const on = value === current;
  return (
    <button type="button" onClick={() => onChange(value)} aria-pressed={on} data-testid={testId}
      className={`text-[9px] px-2 py-0.5 rounded-full border transition ${on ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
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
  return <tr ref={ref} data-testid="golden-sepa-deep-row"><td colSpan={6} className="p-0"><div style={width ? { width, position: "sticky", left: 0 } : undefined}>{children}</div></td></tr>;
}

export default function GoldenSepaPanel({ onSelectTicker, onOpenVision }: { onSelectTicker: (ticker: string) => void; onOpenVision?: (ticker: string) => void }) {
  const { rows, doc, sources, isLoading, error, partial, refresh } = useGoldenSepa();
  const [min, setMin] = useState<MinConfirm>(0);
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
  const shown = useMemo(() => rows.filter((r) => r.confirms.length >= min), [rows, min]);
  const n1 = rows.filter((r) => r.confirms.length >= 1).length, n2 = rows.filter((r) => r.confirms.length >= 2).length;

  return (
    <section style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(245,158,11,0.25)" }} className="rounded-xl p-3 space-y-2.5" aria-label="Golden SEPA" data-testid="golden-sepa">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Star className="w-3 h-3 text-amber-400" /> Golden SEPA
          <span className="hidden sm:inline normal-case font-normal text-slate-500">· SEPA Minervini × CAN SLIM × Base Breakout × Hợp lưu v2</span>
        </h2>
        <button type="button" onClick={refresh} aria-label="Làm mới Golden SEPA" className="text-slate-400 hover:text-slate-200"><RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} /></button>
      </header>
      <p className="text-[9px] text-slate-500 leading-relaxed flex flex-wrap items-start gap-x-1 gap-y-0.5">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        <span className="flex-1 min-w-[14rem]">
          Thay cho Golden Filter × Top 20 Kỹ thuật cũ. Mã thuộc 3 danh sách SEPA (Sẵn sàng / Cảnh báo / Theo dõi), kèm xác nhận chéo của các bộ lọc khác trên
          Gateway (cùng universe, cùng giá điều chỉnh). Xếp theo danh sách → số xác nhận → điểm SEPA; không cộng điểm tự đặt. Xác nhận chéo chưa được kiểm định —
          danh sách để xem xét, không phải khuyến nghị mua.
        </span>
        {doc && <span className="w-full sm:w-auto sm:ml-auto text-slate-400" data-testid="golden-sepa-asof">SEPA phiên {doc.dataAsOf} · CS {sources.camslim ?? "—"} · BB {sources["base-breakout"] ?? "—"} · HL {sources.convergence ?? "—"} · MH {sources.patterns ?? "—"}</span>}
      </p>
      {doc && <SepaIntradayStrip onOpen={(t) => { setMin(0); setOpen(t); }} />}
      {doc && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="golden-sepa-filters">
          <Chip value={0 as MinConfirm} current={min} onChange={setMin} testId="golden-min-0">Tất cả {rows.length}</Chip>
          <Chip value={1 as MinConfirm} current={min} onChange={setMin} testId="golden-min-1">≥ 1 xác nhận {n1}</Chip>
          <Chip value={2 as MinConfirm} current={min} onChange={setMin} testId="golden-min-2">≥ 2 xác nhận {n2}</Chip>
          {doc.market?.sepa && <span className="text-[9px] text-slate-500 ml-auto">Thị trường: <b className="text-slate-300">{doc.market.sepa.danh_gia}</b></span>}
        </div>
      )}
      {partial && doc && <p className="text-[9px] text-amber-300/80" data-testid="golden-sepa-partial">Một số bộ lọc xác nhận chưa tải xong — cột xác nhận có thể thiếu.</p>}
      {error && <div role="alert" className="flex items-center gap-1.5 text-[10px] text-red-300 py-2"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> Không tải được Golden SEPA: {error.message}</div>}
      {isLoading && !doc && <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-5"><RefreshCw className="w-3 h-3 animate-spin" /> Đang tải từ Gateway…</div>}
      {doc && shown.length === 0 && <p className="text-[10px] text-slate-500 italic py-4 text-center">Không có mã nào khớp bộ lọc đang chọn.</p>}
      {doc && shown.length > 0 && (
        <div ref={scrollRef} className={open ? "overflow-x-auto" : "max-h-96 overflow-auto"}>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">SEPA</th>
                <th className="py-1.5 text-right" style={{ paddingRight: 12 }}>Điểm</th>
                <th className="py-1.5">Xác nhận chéo</th>
                <th className="py-1.5 hidden sm:table-cell">Mô hình · dấu chân</th>
                <th className="py-1.5 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {shown.map(({ sepa: r, confirms }: GoldenSepaRow) => (
                <Fragment key={r.ticker}>
                  <tr className={`transition cursor-pointer select-none ${open === r.ticker ? "bg-amber-500/10" : "hover:bg-slate-800/30"}`} onDoubleClick={() => toggle(r.ticker)} aria-expanded={open === r.ticker} data-testid="golden-sepa-row">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(r.ticker)} onDoubleClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 font-black text-amber-400 hover:text-amber-300" aria-label={`Phân tích chuyên sâu ${r.ticker}`}>
                        <ChevronRight className={`w-3 h-3 transition-transform ${open === r.ticker ? "rotate-90" : ""}`} />{r.ticker}
                      </button>
                      <span className="block text-[8px] text-slate-600 truncate max-w-[9rem]">{r.sector ?? "—"}</span>
                    </td>
                    <td className="py-1.5"><span className={`text-[8.5px] px-1.5 py-0.5 rounded-full border font-bold whitespace-nowrap ${LIST_STYLE[r.list]}`}>{LIST_SHORT[r.list]}</span>{isS2Signal(r) && <span className="block mt-0.5 text-[7.5px] text-emerald-300">S2 · đạt OOS*</span>}</td>
                    <td className="py-1.5 text-right font-mono font-bold text-slate-200 whitespace-nowrap" style={{ paddingRight: 12 }}>{r.score.toFixed(1).replace(".", ",")}</td>
                    <td className="py-1.5" data-testid="golden-sepa-confirms">
                      <span className="font-mono text-slate-300 mr-1">{confirms.length}/{GOLDEN_SOURCES}</span>
                      {confirms.map((c) => <span key={c.key} title={`${c.label}: ${c.detail}`} className="inline-block mr-0.5 text-[8px] px-1 py-0.5 rounded border border-amber-500/40 text-amber-200">{CONFIRM_SHORT[c.key]}</span>)}
                    </td>
                    <td className="py-1.5 hidden sm:table-cell">{r.metrics.pattern ? <><span className="text-slate-200">{r.metrics.pattern}</span><span className="block text-[9px] font-mono text-amber-200/90">{r.metrics.footprint}</span></> : <span className="text-slate-600">—</span>}</td>
                    <td className="py-1.5 text-right"><span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-slate-500/10 text-slate-300 whitespace-nowrap">{r.status ? STATUS_VI[r.status] ?? r.status : "—"}</span></td>
                  </tr>
                  {open === r.ticker && (
                    <DeepRow width={frameW}>
                      <div className="px-3 pt-2 flex flex-wrap gap-1.5 text-[9px]" data-testid="golden-sepa-confirm-strip">
                        <span className="text-slate-500">Xác nhận chéo:</span>
                        {confirms.length ? confirms.map((c) => <span key={c.key} className="px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200">{c.label} · {c.detail}</span>) : <span className="text-slate-400">chưa có bộ lọc nào khác xác nhận</span>}
                      </div>
                      <SepaDeepPanel row={r} doc={doc} onClose={() => setOpen(null)} onOpenChart={onSelectTicker} onOpenVision={onOpenVision} />
                    </DeepRow>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[9px] text-slate-600">CS = CAN SLIM · BB = Base Breakout · HL = Hợp lưu v2 (phía mua) · MH = mô hình giá Pring tăng đang hiệu lực (EXPERIMENTAL, kiểm định P3 chưa đạt) · {doc?.disclaimer}</p>
    </section>
  );
}
