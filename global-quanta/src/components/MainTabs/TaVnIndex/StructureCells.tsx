"use client";
// Đồng bộ Cấu trúc MTF với các bộ lọc (T5): cột "Cấu trúc", công tắc "Thuận khung Ngày" (làm NỔI mã thuận khung, KHÔNG ẩn mã khác),
// khối cấu trúc trong bảng phụ phân tích chuyên sâu + nút "Mở trên biểu đồ với cấu trúc".
// Dữ liệu: /api/market/structure-summary (job 15:47, một lần tải / 10 phút) — không thay đổi công thức hay kết quả của bộ lọc.
import { Layers3 } from "lucide-react";
import type { StructureSummaryRow } from "../../../hooks/useStructure";
import { STAGE_SHORT, STAGE_TONE, VERDICT_TONE } from "../../../hooks/useStructure";
import { fmtPrice } from "../../../lib/ta-command-center/chart/structureScene";

const TONE_CLS = { bull: "text-emerald-400", bear: "text-rose-400", warn: "text-amber-300", neutral: "text-cyan-300" } as const;

/** Thuận khung Ngày: giai đoạn ngày đang tăng hoặc tích lũy đáy (R1 / R6 cho phép tìm điểm mua ở khung nhỏ). */
export const isDayAligned = (row: StructureSummaryRow | undefined) => row?.st === "UP" || row?.st === "A";

/** Sự kiện mở biểu đồ kèm lớp Cấu trúc MTF (TVChartPanel lắng nghe). */
export const STRUCTURE_OPEN_EVENT = "gq:structure-open";
export function openChartWithStructure(ticker: string, onOpenChart: (t: string) => void) {
  onOpenChart(ticker);
  try { window.dispatchEvent(new CustomEvent(STRUCTURE_OPEN_EVENT, { detail: { ticker } })); } catch { /* môi trường không có window */ }
}

export function StructureCell({ row }: { row: StructureSummaryRow | undefined }) {
  if (!row) return <span className="text-slate-600">—</span>;
  return (
    <span className="whitespace-nowrap" title={`Ngày: ${STAGE_SHORT[row.st]} (${row.age} phiên) · Tuần: ${row.ws ? STAGE_SHORT[row.ws] : "—"} · ${row.v} (${row.rule}) · bảng kiểm ${row.sc}/8`} data-testid="structure-cell">
      <span className={`font-bold ${TONE_CLS[STAGE_TONE[row.st]]}`}>{STAGE_SHORT[row.st]}</span>
      {row.chg && <span className="ml-0.5 text-[8px] text-amber-300">mới</span>}
      <span className="block text-[8px] text-slate-500"><span className={TONE_CLS[VERDICT_TONE[row.v]]}>{row.v}</span> · {row.sc}/8</span>
    </span>
  );
}

export function AlignToggle({ on, onChange, count }: { on: boolean; onChange: (v: boolean) => void; count?: number }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} data-testid="structure-align-toggle"
      title="Làm nổi các mã có giai đoạn khung Ngày đang tăng / tích lũy đáy (không ẩn mã khác)"
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border transition ${on ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" : "text-slate-400 border-slate-700/60"}`}>
      <Layers3 className="w-3 h-3" /> Thuận khung Ngày{count != null ? ` · ${count}` : ""}
    </button>
  );
}

/** Lớp CSS của dòng khi bật "Thuận khung Ngày": thuận khung nổi bật, mã còn lại mờ đi (vẫn hiển thị). */
export const alignRowClass = (on: boolean, row: StructureSummaryRow | undefined) =>
  !on ? "" : isDayAligned(row) ? "shadow-[inset_2px_0_0_rgba(0,245,160,0.7)]" : "opacity-50";

export function StructureDeepBlock({ ticker, row, onOpenChart }: { ticker: string; row: StructureSummaryRow | undefined; onOpenChart: (t: string) => void }) {
  return (
    <section className="rounded-lg p-2.5 min-w-0 space-y-1" style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.15)" }} data-testid="structure-deep-block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide text-cyan-300 font-bold flex items-center gap-1"><Layers3 className="w-3 h-3" /> Cấu trúc đa khung</span>
        <button type="button" onClick={() => openChartWithStructure(ticker, onOpenChart)} data-testid="structure-open-chart"
          className="text-[9px] font-bold text-cyan-200 underline decoration-dotted">Mở trên biểu đồ với cấu trúc</button>
      </div>
      {row ? (
        <div className="text-[10px] text-slate-300 leading-relaxed">
          Ngày: <b className={TONE_CLS[STAGE_TONE[row.st]]}>{STAGE_SHORT[row.st]}</b> ({row.age} phiên) · Tuần: <b>{row.ws ? STAGE_SHORT[row.ws] : "—"}</b>
          {" "}· Kết luận <b className={TONE_CLS[VERDICT_TONE[row.v]]}>{row.v}</b> <span className="text-slate-500">({row.rule})</span> · bảng kiểm {row.sc}/8
          <br />
          Hỗ trợ {row.sup != null ? fmtPrice(row.sup) : "—"} · Kháng cự {row.res != null ? fmtPrice(row.res) : "—"}
          {" "}· Kích hoạt tăng {row.trigL != null ? fmtPrice(row.trigL) : "—"} / giảm {row.trigS != null ? fmtPrice(row.trigS) : "—"}
          {row.pat && <><br />Mẫu {row.pat.type} {row.pat.status === "confirmed" ? "đã phá cổ" : "đang hình thành"} ({row.pat.date})</>}
          {row.sig && <> · Tín hiệu {row.sig.code} ({row.sig.date})</>}
        </div>
      ) : <p className="text-[10px] text-slate-500">Chưa có trong bản tóm tắt cấu trúc (job 15:47) — mở biểu đồ để phân tích trực tiếp.</p>}
    </section>
  );
}
