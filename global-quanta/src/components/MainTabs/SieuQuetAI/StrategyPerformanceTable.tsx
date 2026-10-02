import { useState } from "react";
import { REGIME_LABEL, useResearchOverview, type PerformanceRow } from "../../../hooks/useResearch";

// Bảng hiệu suất chiến lược gọn: mỗi tín hiệu một dòng, T+3 / T+5 / T+10 = tỷ lệ trúng so với mốc nền
// cùng chiều, cùng ngày, kèm z ĐÃ TÍNH CHỒNG LẤN (sai số cụm ngày × mã). Kết luận theo z cụm.
const SIGNALS: { id: string; label: string }[] = [
  { id: "STEALTH_20", label: "Stealth 20 phiên" },
  { id: "STEALTH_5", label: "Stealth 5 phiên" },
  { id: "IFE_INTENT", label: "Ý đồ dòng tiền (HMM)" },
  { id: "IMPULSE", label: "Market Impulse" },
  { id: "ADAPTIVE_T5", label: "Điểm thích ứng" },
];
const VERDICT: Record<PerformanceRow["verdict"], { glyph: string; text: string; color: string }> = {
  edge: { glyph: "✓", text: "có lợi thế", color: "#059669" },
  negative: { glyph: "✗", text: "ngược kỳ vọng", color: "#e11d48" },
  none: { glyph: "≈", text: "như ngẫu nhiên", color: "#64748b" },
  insufficient: { glyph: "…", text: "chưa đủ mẫu", color: "#64748b" },
};
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

function Cell({ r }: { r: PerformanceRow | undefined }) {
  if (!r) return <td className="py-0.5 px-1 text-right text-slate-600">—</td>;
  const z = r.zHitClustered ?? r.zHit ?? null;
  const v = VERDICT[r.verdict];
  return (
    <td className="py-0.5 px-1 text-right whitespace-nowrap"
      title={`n=${r.n} (hiệu dụng ≈ ${r.effectiveN ?? r.n}) · mua ${r.long} / bán ${r.short} · KTC95% ${pct(r.hitLow)}–${pct(r.hitHigh)} · mốc nền ${pct(r.baseline)} (vạch trắng) · z đã tính chồng lấn ${z ?? "—"} · lợi suất vượt TB ${pct(r.avgSignedExcess)}`}>
      <span style={{ color: v.color }}>{pct(r.hitRate)}</span>
      <span className="text-slate-500"> / {pct(r.baseline)}</span>
      <span className="text-slate-400"> z {z === null ? "—" : z.toFixed(1)}</span>
      {/* KTC 95% của tỷ lệ trúng so với vạch mốc nền */}
      <div className="relative h-1 rounded bg-white/5 mt-0.5" aria-hidden="true">
        <div className="absolute h-full rounded" style={{ left: `${r.hitLow * 100}%`, width: `${Math.max(1, (r.hitHigh - r.hitLow) * 100)}%`, background: v.color, opacity: 0.55 }} />
        <div className="absolute h-full w-px bg-slate-200" style={{ left: `${r.baseline * 100}%` }} />
      </div>
    </td>
  );
}

/** @param activeSignals tín hiệu đang bật cho mã đang xem (đánh dấu ●) */
export default function StrategyPerformanceTable({ activeSignals = [] }: { activeSignals?: string[] }) {
  const { data, error, isLoading } = useResearchOverview();
  const [regime, setRegime] = useState("ALL");
  if (isLoading) return <div className="text-[9px] text-slate-500">Đang tải hiệu suất…</div>;
  if (error || !data?.performance) return <div className="text-[9px] text-slate-500">Chưa có bảng hiệu suất.</div>;
  const rows = data.performance.filter((r) => r.regime === regime);
  const find = (signal: string, h: number) => rows.find((r) => r.signal === (signal === "ADAPTIVE_T5" ? `ADAPTIVE_T${h}` : signal) && r.horizon === h);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[8.5px] text-slate-500">Hiệu suất tín hiệu: trúng / nền · z (đã tính chồng lấn)</div>
        <select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Trạng thái thị trường"
          className="text-[8.5px] bg-black/40 border border-white/10 rounded px-1 text-slate-300">
          {["ALL", "UPTREND", "SIDEWAY", "DOWNTREND"].map((r) => (
            <option key={r} value={r}>{REGIME_LABEL[r]}{data.currentRegime?.regime === r ? " (hiện tại)" : ""}</option>
          ))}
        </select>
      </div>
      <table className="w-full text-[9px] font-mono">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-normal px-1">Tín hiệu</th>
            <th className="text-right font-normal px-1">T+3</th>
            <th className="text-right font-normal px-1">T+5</th>
            <th className="text-right font-normal px-1">T+10</th>
            <th className="text-right font-normal px-1">Kết luận T+5</th>
          </tr>
        </thead>
        <tbody>
          {SIGNALS.map((s) => {
            const t5 = find(s.id, 5);
            const v = t5 ? VERDICT[t5.verdict] : null;
            const active = activeSignals.includes(s.id) || (s.id === "ADAPTIVE_T5" && activeSignals.some((a) => a.startsWith("ADAPTIVE")));
            return (
              <tr key={s.id} className="border-t border-white/5">
                <td className="py-0.5 px-1 text-slate-300 font-sans whitespace-nowrap">
                  {active && <span className="text-violet-300" title="Đang bật cho mã này">● </span>}{s.label}
                </td>
                <Cell r={find(s.id, 3)} />
                <Cell r={t5} />
                <Cell r={find(s.id, 10)} />
                <td className="py-0.5 px-1 text-right font-sans whitespace-nowrap" style={{ color: v?.color ?? "#64748b" }}>
                  {v ? `${v.glyph} ${v.text}` : "chưa có dữ liệu"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
