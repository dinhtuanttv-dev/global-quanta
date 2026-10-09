// AI Chart Vision v2 — biểu đồ nến của một khung (D/W/M) vẽ bằng SVG, mọi lớp GHIM THEO NẾN (toạ độ x theo ngày của nến).
// Mặc định chỉ hiện vùng hỗ trợ/kháng cự GẦN NHẤT (vùng đang hoạt động); MA, pivot, mọi vùng, mô hình Pring: bật bằng nút (mặc định tắt).
import { useMemo } from "react";
import type { CvBar, CvFrame, CvTimeframe, PringPatternFull } from "../../../../hooks/useChartVision";

export interface SketchLayers { ma: boolean; pivots: boolean; allLevels: boolean; patterns: boolean }
export const DEFAULT_LAYERS: SketchLayers = { ma: false, pivots: false, allLevels: false, patterns: false };

const W = 760, H = 300, PAD_L = 6, PAD_R = 58, PAD_T = 10, VOL_H = 40, GAP = 6;
const MA_COLOR = ["#38bdf8", "#f59e0b", "#a78bfa"];
const fmtP = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

interface Props {
  tf: CvTimeframe;
  bars: CvBar[];
  frame: CvFrame | undefined;
  ma: Record<string, (number | null)[]> | undefined;
  layers: SketchLayers;
  patterns?: PringPatternFull[];
}

export default function VisionSketch({ tf, bars, frame, ma, layers, patterns = [] }: Props) {
  const g = useMemo(() => {
    const n = bars.length;
    const idx = new Map(bars.map((b, i) => [b[0], i]));
    const near = [...(frame?.levels?.support.slice(0, 1) ?? []), ...(frame?.levels?.resistance.slice(0, 1) ?? [])];
    const levels = layers.allLevels ? frame?.levels?.all ?? [] : near;
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
    // vùng gần nhất luôn nằm trong khung nhìn (nếu cách giá ≤ 25%)
    const last = bars[n - 1]?.[4] ?? 0;
    for (const z of near) if (Math.abs(z.price / last - 1) <= 0.25) { lo = Math.min(lo, z.lo); hi = Math.max(hi, z.hi); }
    const span = hi - lo || 1; lo -= span * 0.04; hi += span * 0.04;
    const plotH = H - PAD_T - VOL_H - GAP - 14;
    const step = (W - PAD_L - PAD_R) / Math.max(1, n);
    const x = (i: number) => PAD_L + step * (i + 0.5);
    const y = (p: number) => PAD_T + ((hi - p) / (hi - lo)) * plotH;
    const vMax = Math.max(1, ...bars.map((b) => b[5]));
    const volTop = PAD_T + plotH + GAP;
    const nearKeys = new Set(near.map((z) => `${z.price}|${z.firstDate}`));
    return { n, idx, levels: levels.filter((z) => z.hi >= lo && z.lo <= hi), nearKeys, lo, hi, plotH, step, x, y, vMax, volTop };
  }, [bars, frame, layers.allLevels]);

  if (!bars.length) return <div className="text-[10px] text-slate-500 py-10 text-center">Chưa có nến.</div>;
  const { n, idx, levels, x, y, step, vMax, volTop, lo, hi } = g;
  const bw = Math.max(1, Math.min(9, step * 0.68));
  const xOf = (date: string) => { const i = idx.get(date); return i == null ? null : x(i); };
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 5);
  const labelEvery = Math.max(1, Math.round(n / 6));
  const lastClose = bars[n - 1][4];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label={`Biểu đồ nến khung ${frame?.label ?? tf}`} data-testid="cv-sketch">
      {ticks.map((p) => (
        <g key={p}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="rgba(148,163,184,0.08)" />
          <text x={W - PAD_R + 4} y={y(p) + 3} fontSize={8} fill="#64748b">{fmtP(p)}</text>
        </g>
      ))}
      {/* vùng hỗ trợ / kháng cự: dải từ lần chạm đầu tiên (nếu trong cửa sổ) tới nến cuối */}
      {levels.map((z) => {
        const sup = z.hi < lastClose;
        const x0 = xOf(z.firstDate) ?? PAD_L, x1 = W - PAD_R;
        const yt = y(z.hi), yb = y(z.lo);
        const isNear = g.nearKeys.has(`${z.price}|${z.firstDate}`);
        return (
          <g key={`${z.price}-${z.firstDate}`} data-testid={isNear ? "cv-zone-near" : "cv-zone"}>
            <rect x={x0} y={Math.min(yt, yb) - 1.5} width={Math.max(0, x1 - x0)} height={Math.max(3, Math.abs(yb - yt) + 3)}
              fill={sup ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)"} stroke={sup ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)"} strokeDasharray={isNear ? undefined : "3 3"} strokeWidth={0.8} />
            <text x={x1 - 2} y={Math.min(yt, yb) - 3} textAnchor="end" fontSize={8} fill={sup ? "#6ee7b7" : "#fda4af"}>
              {sup ? "HT" : "KC"} {fmtP(z.price)} · {z.touches} chạm
            </text>
          </g>
        );
      })}
      {/* nến */}
      {bars.map((b, i) => {
        const up = b[4] >= b[1], cx = x(i);
        const col = up ? "#10b981" : "#f43f5e";
        return (
          <g key={b[0]}>
            <line x1={cx} x2={cx} y1={y(b[2])} y2={y(b[3])} stroke={col} strokeWidth={0.8} />
            <rect x={cx - bw / 2} y={Math.min(y(b[1]), y(b[4]))} width={bw} height={Math.max(0.8, Math.abs(y(b[1]) - y(b[4])))} fill={up ? "rgba(16,185,129,0.85)" : "rgba(244,63,94,0.85)"} />
            <rect x={cx - bw / 2} y={volTop + VOL_H - (b[5] / vMax) * VOL_H} width={bw} height={(b[5] / vMax) * VOL_H} fill={up ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)"} />
          </g>
        );
      })}
      {layers.ma && ma && Object.entries(ma).map(([nStr, vals], k) => {
        const d = vals.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
        return d ? <polyline key={nStr} points={d} fill="none" stroke={MA_COLOR[k % 3]} strokeWidth={1.1} opacity={0.9} data-testid="cv-ma" /> : null;
      })}
      {layers.pivots && frame?.structure?.pivots.map((p) => {
        const cx = xOf(p.date); if (cx == null) return null;
        return <g key={`${p.type}${p.date}`} data-testid="cv-pivot">
          <circle cx={cx} cy={y(p.price)} r={2.6} fill={p.type === "H" ? "#fda4af" : "#6ee7b7"} stroke="#0f172a" strokeWidth={0.6} />
          <text x={cx} y={y(p.price) + (p.type === "H" ? -5 : 10)} textAnchor="middle" fontSize={7} fill="#cbd5e1">{p.type === "H" ? "Đ" : "Đy"}</text>
        </g>;
      })}
      {layers.patterns && patterns.map((p) => (
        <g key={`${p.type}${p.lines[0]?.d0}`} data-testid="cv-pattern">
          {p.lines.map((l) => {
            const x0 = xOf(l.d0), x1 = xOf(l.d1); if (x0 == null || x1 == null) return null;
            return <line key={l.name} x1={x0} y1={y(l.p0)} x2={x1} y2={y(l.p1)} stroke={p.dir === "bull" ? "#34d399" : "#fb7185"} strokeWidth={1.3} strokeDasharray={l.name.includes("cổ") || l.name.includes("Biên") ? undefined : "4 2"} />;
          })}
          {p.points.map((pt) => { const cx = xOf(pt.date); return cx == null ? null : <text key={pt.name} x={cx} y={y(pt.price) - 4} textAnchor="middle" fontSize={7} fill="#e2e8f0">{pt.name}</text>; })}
        </g>
      ))}
      {/* giá cuối */}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(lastClose)} y2={y(lastClose)} stroke="rgba(251,191,36,0.5)" strokeDasharray="2 3" />
      <rect x={W - PAD_R + 1} y={y(lastClose) - 6} width={PAD_R - 2} height={12} rx={2} fill="#f59e0b" />
      <text x={W - PAD_R + 4} y={y(lastClose) + 3} fontSize={8} fontWeight={700} fill="#0f172a">{fmtP(lastClose)}</text>
      {bars.map((b, i) => (i % labelEvery === 0 ? <text key={`t${b[0]}`} x={x(i)} y={H - 3} textAnchor="middle" fontSize={7.5} fill="#64748b">{tf === "M" ? b[0].slice(0, 7) : b[0].slice(5)}</text> : null))}
    </svg>
  );
}
