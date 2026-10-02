import { useState, type ReactNode } from "react";
import type { SieuQuetIndexState } from "../../../hooks/useSieuQuetScanner";
import { REGIME_LABEL, useResearchOverview } from "../../../hooks/useResearch";
import { HmmBar, riskLevel } from "./MarketIntel";

const BIAS_COLOR: Record<string, string> = {
  uptrend: "#10b981", accumulation: "#f59e0b", defensive: "#60a5fa", distribution: "#f43f5e", downtrend: "#f43f5e",
};
const REGIME_STYLE: Record<string, { color: string; glyph: string }> = {
  UPTREND: { color: "#059669", glyph: "▲" }, SIDEWAY: { color: "#d97706", glyph: "■" }, DOWNTREND: { color: "#e11d48", glyph: "▼" },
};
const KEY = "gq.vnBandOpen";

function Chip({ label, value, color, title }: { label: string; value: ReactNode; color?: string; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={title}>
      <span className="text-slate-500">{label}</span>
      <b className="font-mono" style={{ color: color ?? "#e2e8f0" }}>{value}</b>
    </span>
  );
}

/**
 * Dải VN-Index phía trên Bảng Siêu Quét (thay cột trái 4/12 cũ để bảng rộng toàn bộ):
 * mặc định chỉ một dòng tóm tắt (trạng thái, xác suất chế độ HMM, rủi ro dòng tiền rút, dấu chân tay to — đọc vị trong một dòng);
 * "Chi tiết" mở Phân tích kỹ thuật đa tầng, Market Impulse & dòng tiền lớn và AI phân tích VN-Index (lưới 3/3/6).
 * Trạng thái mở/đóng nhớ theo trình duyệt.
 */
export default function VnIndexBand({ indexState, technical, impulse, aiPanel, toggle }: {
  indexState: SieuQuetIndexState | null; technical: ReactNode; impulse: ReactNode; aiPanel: ReactNode; toggle: ReactNode;
}) {
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const { data: research } = useResearchOverview();
  const cur = research?.index?.current ?? null;
  const intel = research?.intel?.current ?? null;
  const risk = riskLevel(intel?.risk);
  const st = cur ? REGIME_STYLE[cur.regime] : null;
  const s = indexState;
  const impulseColor = !s ? undefined : s.impulseScore < 35 ? "#f43f5e" : s.impulseScore <= 65 ? "#f59e0b" : "#10b981";
  const box = { background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" };

  return (
    <section className="rounded-xl" style={box} aria-label="VN-Index">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px]">
        <span className="text-sm font-semibold text-cyan-400">VN-Index</span>
        {s ? (
          <>
            <Chip label="Xu hướng" value={s.trendLabel} color={BIAS_COLOR[s.trendBias]} />
            <Chip label="Impulse" value={s.impulseScore.toFixed(1)} color={impulseColor} title="Market Impulse Gauge (0–100)" />
            <Chip label="Độ rộng" value={`${s.marketBreadthPct.toFixed(1)}%`} title="% mã trên MA20" />
            <Chip label="RSI14" value={s.rsi14.toFixed(1)} />
            <Chip label="Breakout" value={`${s.breakoutProbability.toFixed(0)}%`} />
          </>
        ) : <span className="text-slate-500">Đang tải dữ liệu VN-Index…</span>}
        {cur && st && (
          <Chip label="Trạng thái" value={`${st.glyph} ${REGIME_LABEL[cur.regime]} · ${cur.streak} phiên`} color={st.color} title="AI phân tích VN-Index" />
        )}
        {intel && <HmmBar c={intel} compact />}
        {intel?.risk !== null && intel?.risk !== undefined && (
          <Chip label="Rủi ro dòng tiền rút" value={`${intel.risk} · ${risk.label}`} color={risk.color}
            title="Phân vị ngày phân phối, dấu chân tay to âm, độ rộng thấp, P(HMM Giảm) — chỉ số mô tả" />
        )}
        {intel?.zLd5 !== null && intel?.zLd5 !== undefined && (
          <Chip label="Tay to" value={`z ${intel.zLd5 >= 0 ? "+" : "−"}${Math.abs(intel.zLd5).toFixed(2)}`} color={intel.zLd5 >= 0 ? "#10b981" : "#f43f5e"}
            title="Dấu chân lệnh tay to toàn thị trường, 5 phiên, z so 60 phiên trước" />
        )}
        <div className="ml-auto flex items-center gap-3">
          {toggle}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="vn-band-detail"
            className="text-[10.5px] px-2 py-0.5 rounded border border-white/10 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/40">
            {open ? "Thu gọn ▴" : "Chi tiết ▾"}
          </button>
        </div>
      </div>
      {open && (
        <div id="vn-band-detail" className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-12 gap-4 px-4 pb-4">
          <div className="rounded-xl p-4 2xl:col-span-3" style={box}>
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">Phân Tích Kỹ Thuật VN-Index Đa Tầng</h2>
            {technical}
          </div>
          <div className="rounded-xl p-4 2xl:col-span-3" style={box}>
            <h2 className="text-sm font-semibold text-blue-400 mb-3">Market Impulse Gauge & Dòng tiền lớn</h2>
            {impulse}
          </div>
          <div className="min-w-0 lg:col-span-2 2xl:col-span-6">{aiPanel ?? <div className="rounded-xl p-4 text-[10px] text-slate-500" style={box}>AI phân tích VN-Index đang ẩn (bật công tắc "AI nghiên cứu").</div>}</div>
        </div>
      )}
    </section>
  );
}
