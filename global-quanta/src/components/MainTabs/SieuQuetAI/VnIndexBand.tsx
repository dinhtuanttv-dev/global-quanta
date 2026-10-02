import { useState, type ReactNode } from "react";
import type { SieuQuetIndexState } from "../../../hooks/useSieuQuetScanner";
import { REGIME_LABEL, useResearchOverview } from "../../../hooks/useResearch";

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
 * mặc định chỉ một dòng tóm tắt; "Chi tiết" mở Phân tích kỹ thuật đa tầng, Market Impulse Gauge và
 * AI phân tích VN-Index xếp ngang. Trạng thái mở/đóng nhớ theo trình duyệt.
 */
export default function VnIndexBand({ indexState, technical, impulse, aiPanel, toggle }: {
  indexState: SieuQuetIndexState | null; technical: ReactNode; impulse: ReactNode; aiPanel: ReactNode; toggle: ReactNode;
}) {
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const { data: research } = useResearchOverview();
  const cur = research?.index?.current ?? null;
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
        <div className="ml-auto flex items-center gap-3">
          {toggle}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="vn-band-detail"
            className="text-[10.5px] px-2 py-0.5 rounded border border-white/10 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/40">
            {open ? "Thu gọn ▴" : "Chi tiết ▾"}
          </button>
        </div>
      </div>
      {open && (
        <div id="vn-band-detail" className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 pb-4">
          <div className="rounded-xl p-4" style={box}>
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">Phân Tích Kỹ Thuật VN-Index Đa Tầng</h2>
            {technical}
          </div>
          <div className="rounded-xl p-4" style={box}>
            <h2 className="text-sm font-semibold text-blue-400 mb-3">Market Impulse Gauge</h2>
            {impulse}
          </div>
          <div className="min-w-0">{aiPanel ?? <div className="rounded-xl p-4 text-[10px] text-slate-500" style={box}>AI phân tích VN-Index đang ẩn (bật công tắc "AI nghiên cứu").</div>}</div>
        </div>
      )}
    </section>
  );
}
