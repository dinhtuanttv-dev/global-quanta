// Bộ lọc SEPA Minervini (SP4) — danh sách từ Gateway (chiến lược "sepa"), cùng khuôn với CAN SLIM / Base Breakout / Hợp lưu v2:
// sức khỏe thị trường (s.196–226), ngành dẫn dắt, lọc theo danh sách / mô hình, toàn bộ kết quả, thời điểm quét; bấm mã hoặc nhấn
// đúp dòng -> bảng phụ phân tích chuyên sâu (không mở biểu đồ), bấm lại / Esc -> đóng.
// Danh sách theo dõi kiểu sổ tay của tác giả (Hình 10.42): SẴN SÀNG MUA -> CẢNH BÁO MUA -> THEO DÕI (+ LOẠI), ghi kèm dấu chân "7W 10/3 3T".
// Chưa kiểm định ngoài mẫu (SP3) -> EXPERIMENTAL: danh sách để XEM XÉT, không phải khuyến nghị mua.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Info, RefreshCw, Trophy } from "lucide-react";
import { SEPA_LISTS, useSepa, type SepaList, type SepaRow } from "../../../hooks/useSepa";
import SepaDeepPanel, { LIST_STYLE, STATUS_VI } from "./SepaDeepPanel";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");
const HEALTH_STYLE: Record<string, string> = {
  "THUẬN LỢI": "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "TRUNG TÍNH": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "THẬN TRỌNG": "bg-amber-500/15 text-amber-200 border-amber-500/40",
  "BẤT LỢI": "bg-rose-500/15 text-rose-300 border-rose-500/40",
};
const PATTERNS = ["VCP", "Nền phẳng", "Cốc–tay cầm", "3-C", "Low cheat", "Tấn công tổng lực (cờ cao)", "Nền giá đầu tiên (mới niêm yết)"];
const PATTERN_SHORT: Record<string, string> = { "Tấn công tổng lực (cờ cao)": "Cờ cao", "Nền giá đầu tiên (mới niêm yết)": "Nền đầu tiên" };
const LIST_SHORT: Record<SepaList, string> = { "SẴN SÀNG MUA": "Sẵn sàng", "CẢNH BÁO MUA": "Cảnh báo", "THEO DÕI": "Theo dõi", "LOẠI": "Loại" };

type ListFilter = "active" | SepaList;

function Chip<T extends string>({ value, current, onChange, children, testId }: { value: T; current: T; onChange: (v: T) => void; children: React.ReactNode; testId?: string }) {
  const on = value === current;
  return (
    <button type="button" onClick={() => onChange(value)} aria-pressed={on} data-testid={testId}
      className={`text-[9px] px-2 py-0.5 rounded-full border transition ${on ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
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
    <tr ref={ref} className="border-b border-emerald-900/40" data-testid="sepa-deep-row">
      <td colSpan={8} className="p-0"><div style={width ? { width, position: "sticky", left: 0 } : undefined}>{children}</div></td>
    </tr>
  );
}

export default function SepaPanel({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const { data, error, isLoading, refresh } = useSepa();
  const [list, setList] = useState<ListFilter>("active");
  const [pattern, setPattern] = useState<string>("all");
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
    (list === "active" ? r.list !== "LOẠI" : r.list === list) && (pattern === "all" || r.metrics.pattern === pattern)), [data, list, pattern]);
  const patternCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.results ?? []) if (r.list !== "LOẠI" && r.metrics.pattern) m.set(r.metrics.pattern, (m.get(r.metrics.pattern) ?? 0) + 1);
    return m;
  }, [data]);
  const mh = data?.market?.sepa;
  const active = data ? data.lists["SẴN SÀNG MUA"] + data.lists["CẢNH BÁO MUA"] + data.lists["THEO DÕI"] : 0;
  const sectors = (data?.sectors ?? []).filter((s) => s.count >= 2).slice(0, 5);

  return (
    <section style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(5,150,105,0.28)" }} className="rounded-xl p-3 space-y-2.5" aria-label="Bộ lọc SEPA Minervini" data-testid="sepa-panel">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-emerald-400" /> SEPA Minervini
          <span className="hidden sm:inline normal-case font-normal text-slate-500">· Trend Template · 4 giai đoạn · VCP & nền giá · cơ bản · dẫn dắt · rủi ro</span>
        </h2>
        <button type="button" onClick={() => void refresh()} aria-label="Làm mới bộ lọc SEPA" className="text-slate-400 hover:text-slate-200">
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <p className="text-[9px] text-slate-500 leading-relaxed flex flex-wrap items-start gap-x-1 gap-y-0.5">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        <span className="flex-1 min-w-[14rem]">
          Theo sách "Giao dịch như một phù thủy chứng khoán" (Mark Minervini): cổng Trend Template 8 tiêu chí rồi các bộ lọc tách biệt, tổng hợp bằng điểm.
          Chưa kiểm định ngoài mẫu — danh sách để xem xét, không phải khuyến nghị mua. {data?.disclaimer}
        </span>
        {data && <span className="w-full sm:w-auto sm:ml-auto text-slate-400" data-testid="sepa-asof">Gateway · phiên {data.dataAsOf} · quét {fmtTime(data.generatedAt)} · {active}/{data.scannedCount} mã</span>}
      </p>

      {mh && (
        <div className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px]" data-testid="sepa-market">
          <span className="text-slate-400">Thị trường chung:</span>
          <span className={`px-1.5 py-0.5 rounded-full border font-bold ${HEALTH_STYLE[mh.danh_gia]}`} data-testid="sepa-market-verdict">{mh.danh_gia}</span>
          <span className="text-slate-300">VN-Index {mh.tren_MA50 ? "✓" : "✗"} MA50 · {mh.tren_MA200 ? "✓" : "✗"} MA200</span>
          <span className="text-slate-300">Ngày phân phối 25p: <b className={(mh.ngay_phan_phoi_25_phien ?? 0) >= 5 ? "text-rose-300" : "text-slate-200"}>{mh.ngay_phan_phoi_25_phien ?? "—"}</b></span>
          <span className="text-slate-300">Đỉnh / đáy 52 tuần: {mh.so_dinh_52t ?? "—"} / {mh.so_day_52t ?? "—"}</span>
          <span className="text-slate-300">Đạt Trend Template: {mh.ty_le_dat_trend_template != null ? `${(mh.ty_le_dat_trend_template * 100).toFixed(1).replace(".", ",")}%` : "—"}</span>
          <span className="w-full text-slate-500">{mh.goi_y_rui_ro}{mh.hardMarket ? " · kế hoạch lệnh đang dùng dừng lỗ 6%." : ""}</span>
        </div>
      )}
      {sectors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[9px]" data-testid="sepa-sectors">
          <span className="text-slate-500">Ngành dẫn dắt (RS TB, s.199):</span>
          {sectors.map((s) => <span key={s.nganh} className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">#{s.hang_nganh} {s.nganh} · {String(s.mean).replace(".", ",")}</span>)}
        </div>
      )}
      {data?.evidence?.label === "PENDING" && <p className="text-[9px] text-amber-300/80 rounded-lg border border-slate-800/70 bg-slate-950/40 p-2" data-testid="sepa-evidence-pending">Bằng chứng lịch sử: {data.evidence.reason}</p>}

      {data && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="sepa-filters">
          <Chip value="active" current={list} onChange={setList} testId="sepa-filter-active">3 danh sách {active}</Chip>
          {SEPA_LISTS.map((l) => <Chip key={l} value={l} current={list} onChange={setList} testId={`sepa-filter-${l}`}>{LIST_SHORT[l]} {data.lists[l]}</Chip>)}
          <span className="w-px h-3 bg-slate-700 mx-1" />
          <Chip value="all" current={pattern} onChange={setPattern}>Mọi mô hình</Chip>
          {PATTERNS.filter((x) => patternCounts.has(x)).map((x) => <Chip key={x} value={x} current={pattern} onChange={setPattern} testId={`sepa-pattern-${x}`}>{PATTERN_SHORT[x] ?? x} {patternCounts.get(x)}</Chip>)}
        </div>
      )}

      {error && <div role="alert" className="flex items-center gap-1.5 text-[10px] text-red-300 py-2"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> Không tải được bộ lọc SEPA: {error.message}</div>}
      {isLoading && !data && <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-5"><RefreshCw className="w-3 h-3 animate-spin" /> Đang tải kết quả quét SEPA từ Gateway…</div>}
      {data && rows.length === 0 && <p className="text-[10px] text-slate-500 italic py-4 text-center">Không có mã nào khớp bộ lọc đang chọn.</p>}

      {rows.length > 0 && data && (
        <div ref={scrollRef} className={open ? "overflow-x-auto" : "max-h-96 overflow-auto"}>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Danh sách</th>
                <th className="py-1.5 text-right" style={{ paddingRight: 12, width: 64 }}>Điểm</th>
                <th className="py-1.5" style={{ paddingLeft: 4 }}>Mô hình · dấu chân</th>
                <th className="py-1.5 text-right hidden sm:table-cell">TT · GĐ</th>
                <th className="py-1.5 text-right hidden sm:table-cell">RS</th>
                <th className="py-1.5 text-right hidden sm:table-cell">Pivot · stop</th>
                <th className="py-1.5 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {rows.map((r: SepaRow) => (
                <Fragment key={r.ticker}>
                  <tr className={`transition cursor-pointer select-none ${open === r.ticker ? "bg-emerald-500/10" : "hover:bg-slate-800/30"}`}
                    onDoubleClick={() => toggle(r.ticker)} aria-expanded={open === r.ticker} data-testid="sepa-row">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(r.ticker)} onDoubleClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 font-black text-amber-400 hover:text-amber-300"
                        title={`Phân tích chuyên sâu ${r.ticker} (bấm lại hoặc Esc để đóng)`} aria-label={`Phân tích chuyên sâu ${r.ticker}`}>
                        <ChevronRight className={`w-3 h-3 transition-transform ${open === r.ticker ? "rotate-90" : ""}`} />{r.ticker}
                      </button>
                      <span className="block text-[8px] text-slate-600 truncate max-w-[9rem]">{r.sector ?? "—"}</span>
                    </td>
                    <td className="py-1.5"><span className={`text-[8.5px] px-1.5 py-0.5 rounded-full border font-bold whitespace-nowrap ${LIST_STYLE[r.list]}`}>{LIST_SHORT[r.list]}</span></td>
                    <td className="py-1.5 text-right font-mono font-bold text-slate-200 whitespace-nowrap" style={{ paddingRight: 12, width: 64 }} title={r.components ? `Xu hướng ${r.components.trend.toFixed(1)} · cơ bản ${r.components.fund.toFixed(1)} · RS ${r.components.rs.toFixed(1)} · mô hình ${r.components.pattern.toFixed(1)} · dẫn dắt ${r.components.lead.toFixed(1)}${r.components.penalty ? ` · cảnh báo ${r.components.penalty}` : ""}` : undefined}>
                      {r.score.toFixed(1).replace(".", ",")}
                      <span className="block text-[8px] font-normal text-slate-500">{r.screensPassed}/5 bộ lọc</span>
                    </td>
                    <td className="py-1.5" style={{ paddingLeft: 4 }}>
                      {r.metrics.pattern ? (
                        <>
                          <span className="text-slate-200">{PATTERN_SHORT[r.metrics.pattern] ?? r.metrics.pattern}</span>
                          <span className="block text-[9px] font-mono text-amber-200/90" data-testid="sepa-footprint-cell">{r.metrics.footprint}</span>
                        </>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-1.5 text-right hidden sm:table-cell"><span className={r.trend.passed ? "text-emerald-300" : "text-slate-400"}>{r.trend.score}/8</span><span className="text-slate-500"> · GĐ{r.metrics.stage}{r.metrics.baseNo ? ` · n${r.metrics.baseNo}` : ""}</span></td>
                    <td className="py-1.5 text-right font-mono text-slate-300 hidden sm:table-cell">{r.metrics.rs != null ? Math.round(r.metrics.rs) : "—"}</td>
                    <td className="py-1.5 text-right font-mono text-slate-300 hidden sm:table-cell">{fmtP(r.metrics.pivot)}<span className="block text-[8px] text-rose-300/80">{r.metrics.stopPct != null ? `−${String(r.metrics.stopPct).replace(".", ",")}%` : ""}</span></td>
                    <td className="py-1.5 text-right">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${r.status === "BREAKOUT" ? "bg-emerald-500/15 text-emerald-300" : r.status === "NEAR_PIVOT" ? "bg-amber-500/15 text-amber-200" : "bg-slate-500/10 text-slate-400"}`}>
                        {r.status ? STATUS_VI[r.status] ?? r.status : "—"}
                      </span>
                    </td>
                  </tr>
                  {open === r.ticker && (
                    <DeepRow width={frameW}><SepaDeepPanel row={r} doc={data} onClose={() => setOpen(null)} onOpenChart={onSelectTicker} /></DeepRow>
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
