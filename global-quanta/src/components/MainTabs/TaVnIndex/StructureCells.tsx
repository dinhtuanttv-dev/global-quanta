"use client";
// Đồng bộ Cấu trúc MTF v3 với các bộ lọc: cột "Cấu trúc", công tắc "Thuận khung Ngày" (làm NỔI mã thuận khung, KHÔNG ẩn mã khác),
// khối cấu trúc trong bảng phụ phân tích chuyên sâu + nút "Mở trên biểu đồ với cấu trúc".
// Dữ liệu: /api/market/structure-summary (job 15:47, một lần tải / 10 phút) — trường `s3` = MTF v3 Ngày · Tuần · Tháng. Không thay đổi
// công thức hay kết quả của bộ lọc. Toàn bộ là MÔ TẢ (kiểm định đặt trước MTF-v3: H1–H6 không đạt).
import { Layers3 } from "lucide-react";
import type { StructureSummaryRow } from "../../../hooks/useStructure";
import { STAGE_STYLE } from "./mtf3/StructureFrames";

const DOW_SHORT: Record<string, string> = { UP: "Dow tăng", UP_WEAK: "tăng suy yếu", BROKEN_UP: "tăng đã gãy", DOWN: "Dow giảm", DOWN_WEAK: "giảm suy yếu", BROKEN_DOWN: "giảm đã gãy", RANGE: "đi ngang" };
const DEC: Record<string, { text: string; cls: string }> = {
  setup: { text: "có thiết lập", cls: "text-emerald-300" }, blocked: { text: "thiết lập bị chặn", cls: "text-amber-300" }, wait: { text: "chờ", cls: "text-slate-400" },
};
const SETUP: Record<string, string> = { pullback: "mua điều chỉnh", breakout: "phá vỡ nền", expansion: "nén → mở rộng", reversal: "đảo chiều" };
const PATTERN: Record<string, string> = { VCP: "VCP", FLAT: "nền phẳng", CUP_HANDLE: "cốc tay cầm", DOUBLE_BOTTOM: "đáy đôi", TRIANGLE: "tam giác", RECTANGLE: "hộp", GENERIC: "nền giá" };

/** Thuận khung Ngày (v3): giai đoạn 2 hoặc Dow ngày đang tăng / vừa gãy xu hướng giảm. */
export const isDayAligned = (row: StructureSummaryRow | undefined) =>
  !!row?.s3 && (row.s3.st === "S2" || row.s3.dow === "UP" || row.s3.dow === "BROKEN_DOWN");

/** Sự kiện mở biểu đồ kèm lớp Cấu trúc MTF (TVChartPanel lắng nghe). */
export const STRUCTURE_OPEN_EVENT = "gq:structure-open";
export function openChartWithStructure(ticker: string, onOpenChart: (t: string) => void) {
  onOpenChart(ticker);
  try { window.dispatchEvent(new CustomEvent(STRUCTURE_OPEN_EVENT, { detail: { ticker } })); } catch { /* môi trường không có window */ }
}

export function StructureCell({ row }: { row: StructureSummaryRow | undefined }) {
  const s = row?.s3;
  if (!row || !s) return <span className="text-slate-600">—</span>;
  const st = STAGE_STYLE[s.st] ?? STAGE_STYLE.NA, dec = DEC[s.dec] ?? DEC.wait;
  return (
    <span className="whitespace-nowrap" data-testid="structure-cell"
      title={`MTF v3 · Ngày: ${st.short} (${s.age} phiên, Trend Template ${s.tpl}/7) · ${DOW_SHORT[s.dow] ?? s.dow} · Tuần: ${s.ws ? STAGE_STYLE[s.ws].short : "—"}${s.wdow ? ` · ${DOW_SHORT[s.wdow] ?? s.wdow}` : ""} · ${dec.text}${s.setup ? ` (${SETUP[s.setup]})` : ""}${s.base ? ` · ${PATTERN[s.base.p] ?? s.base.p} ${s.base.fp}${s.base.ok ? "" : " (chưa đạt chuẩn)"}` : ""} — MÔ TẢ, kiểm định đặt trước không đạt`}>
      <span className={`font-bold ${st.cls.split(" ")[0]}`}>{st.short}</span>
      {row.chg && <span className="ml-0.5 text-[8px] text-amber-300">mới</span>}
      <span className="block text-[8px] text-slate-500"><span className={dec.cls}>{dec.text}</span> · {DOW_SHORT[s.dow] ?? s.dow}</span>
    </span>
  );
}

export function AlignToggle({ on, onChange, count }: { on: boolean; onChange: (v: boolean) => void; count?: number }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} data-testid="structure-align-toggle"
      title="Làm nổi các mã đang ở giai đoạn 2 hoặc có Dow khung Ngày tăng (không ẩn mã khác)"
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border transition ${on ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" : "text-slate-400 border-slate-700/60"}`}>
      <Layers3 className="w-3 h-3" /> Thuận khung Ngày{count != null ? ` · ${count}` : ""}
    </button>
  );
}

/** Lớp CSS của dòng khi bật "Thuận khung Ngày": thuận khung nổi bật, mã còn lại mờ đi (vẫn hiển thị). */
export const alignRowClass = (on: boolean, row: StructureSummaryRow | undefined) =>
  !on ? "" : isDayAligned(row) ? "shadow-[inset_2px_0_0_rgba(0,245,160,0.7)]" : "opacity-50";

export function StructureDeepBlock({ ticker, row, onOpenChart }: { ticker: string; row: StructureSummaryRow | undefined; onOpenChart: (t: string) => void }) {
  const s = row?.s3;
  return (
    <section className="rounded-lg p-2.5 min-w-0 space-y-1" style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.15)" }} data-testid="structure-deep-block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide text-cyan-300 font-bold flex items-center gap-1"><Layers3 className="w-3 h-3" /> Cấu trúc MTF v3</span>
        <button type="button" onClick={() => openChartWithStructure(ticker, onOpenChart)} data-testid="structure-open-chart"
          className="text-[9px] font-bold text-cyan-200 underline decoration-dotted">Mở trên biểu đồ với cấu trúc</button>
      </div>
      {s ? (
        <div className="text-[10px] text-slate-300 leading-relaxed">
          Ngày: <b className={(STAGE_STYLE[s.st] ?? STAGE_STYLE.NA).cls.split(" ")[0]}>{(STAGE_STYLE[s.st] ?? STAGE_STYLE.NA).short}</b> ({s.age} phiên · Trend Template {s.tpl}/7) · {DOW_SHORT[s.dow] ?? s.dow}
          {" "}· Tuần: <b>{s.ws ? STAGE_STYLE[s.ws].short : "—"}</b>{s.wdow ? ` · ${DOW_SHORT[s.wdow] ?? s.wdow}` : ""}
          <br />
          <span className={(DEC[s.dec] ?? DEC.wait).cls}>{(DEC[s.dec] ?? DEC.wait).text}</span>{s.setup ? ` · ${SETUP[s.setup]}` : ""}{s.rr != null ? ` · R:R 1:${s.rr.toString().replace(".", ",")}` : ""}
          {s.base && <> · {PATTERN[s.base.p] ?? s.base.p} <span className="font-mono">{s.base.fp}</span>{s.base.ok ? "" : " (chưa đạt chuẩn)"}{s.base.bk ? ` · phá vỡ ${s.base.bk}` : ""}</>}
          <span className="block text-[9px] text-slate-500">Mô tả — kiểm định đặt trước MTF-v3 (H1–H6) không đạt.</span>
        </div>
      ) : <p className="text-[10px] text-slate-500">Chưa có trong bản tóm tắt cấu trúc (job 15:47) — mở biểu đồ để phân tích trực tiếp.</p>}
    </section>
  );
}
