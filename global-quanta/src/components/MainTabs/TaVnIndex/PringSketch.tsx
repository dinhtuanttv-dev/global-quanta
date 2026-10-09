// Pattern Scanner v2 — mô phỏng mô hình Pring TRÊN GIÁ THẬT (SVG), mọi lớp ghim theo nến (x theo ngày của nến):
// biên / viền cổ, các điểm mô hình, đường cong (đáy/đỉnh tròn), điểm phá vỡ + xác nhận, mức thất bại 50%, mục tiêu 1×/2×/3× (log),
// đỉnh tam giác, khối lượng với thanh phá vỡ tô sáng. Chỉ vẽ mô hình đang chọn (không lớp chỉ báo nào khác).
import { useMemo } from "react";
import type { CompactBar, PatternFull } from "../../../hooks/usePatterns";

const W = 760, H = 300, PL = 6, PR = 62, PT = 12, VOL = 42, GAP = 6;
const fmtP = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

export default function PringSketch({ bars, p }: { bars: CompactBar[]; p: PatternFull }) {
  const g = useMemo(() => {
    const idxAll = new Map(bars.map((b, i) => [b[0], i]));
    const s = idxAll.get(p.startDate) ?? 0;
    const a = Math.max(0, s - 15), view = bars.slice(a);
    const idx = new Map(view.map((b, i) => [b[0], i]));
    const bo = p.breakout ? idx.get(p.breakout.date) ?? null : null;
    let lo = Infinity, hi = -Infinity;
    for (const b of view) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
    for (const pt of p.points) { lo = Math.min(lo, pt.price); hi = Math.max(hi, pt.price); }
    const last = view[view.length - 1]?.[4] ?? 0;
    const near = (v: number | null | undefined) => v != null && Number.isFinite(v) && Math.abs(Math.log(v / last)) <= 0.35;
    const t1 = p.targets[0];
    if (near(t1)) { lo = Math.min(lo, t1); hi = Math.max(hi, t1); }
    if (near(p.failLevel)) { lo = Math.min(lo, p.failLevel!); hi = Math.max(hi, p.failLevel!); }
    const span = hi - lo || 1; lo -= span * 0.05; hi += span * 0.05;
    const plotH = H - PT - VOL - GAP - 14, n = view.length, step = (W - PL - PR) / Math.max(1, n);
    const x = (i: number) => PL + step * (i + 0.5), y = (v: number) => PT + ((hi - v) / (hi - lo)) * plotH;
    const vMax = Math.max(1, ...view.map((b) => b[5]));
    return { view, idx, a, bo, lo, hi, plotH, n, step, x, y, vMax, volTop: PT + plotH + GAP };
  }, [bars, p]);
  if (!bars.length) return <div className="text-[10px] text-slate-500 py-10 text-center">Chưa có nến.</div>;
  const { view, idx, bo, lo, hi, n, step, x, y, vMax, volTop } = g;
  const xd = (d: string | null | undefined) => { if (!d) return null; const i = idx.get(d); return i == null ? null : x(i); };
  const inView = (v: number) => v >= lo && v <= hi;
  const bw = Math.max(1, Math.min(9, step * 0.68));
  const bull = p.dir === "bull", col = bull ? "#34d399" : "#fb7185";
  const xBo = bo != null ? x(bo) : null, xEnd = W - PR;
  const curve = p.curve ? (() => {
    const i0 = (idx.get(p.curve.startDate) ?? -1);
    if (i0 < 0) return null;
    const pts: string[] = [];
    for (let k = 0; k <= p.curve.N; k++) { const xx = k / p.curve.N, v = Math.exp(p.curve.c0 + p.curve.b1 * xx + p.curve.q * xx * xx); if (i0 + k < n) pts.push(`${x(i0 + k).toFixed(1)},${y(v).toFixed(1)}`); }
    return pts.join(" ");
  })() : null;
  const labelEvery = Math.max(1, Math.round(n / 6));
  const lastClose = view[n - 1][4];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label={`Mô phỏng ${p.label} trên giá thật`} data-testid="pring-sketch">
      {[0.15, 0.4, 0.65, 0.9].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={PL} x2={xEnd} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.08)" /><text x={xEnd + 4} y={y(v) + 3} fontSize={8} fill="#64748b">{fmtP(v)}</text></g>; })}
      {/* thân mô hình */}
      {xd(p.startDate) != null && xd(p.endDate) != null && <rect x={xd(p.startDate)!} y={PT} width={Math.max(1, xd(p.endDate)! - xd(p.startDate)!)} height={g.plotH} fill={bull ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.05)"} data-testid="pring-body" />}
      {view.map((b, i) => {
        const up = b[4] >= b[1], c = up ? "#10b981" : "#f43f5e", cx = x(i), isBo = i === bo;
        return (
          <g key={b[0]}>
            <line x1={cx} x2={cx} y1={y(b[2])} y2={y(b[3])} stroke={c} strokeWidth={0.8} />
            <rect x={cx - bw / 2} y={Math.min(y(b[1]), y(b[4]))} width={bw} height={Math.max(0.8, Math.abs(y(b[1]) - y(b[4])))} fill={up ? "rgba(16,185,129,0.8)" : "rgba(244,63,94,0.8)"} />
            <rect x={cx - bw / 2} y={volTop + VOL - (b[5] / vMax) * VOL} width={bw} height={(b[5] / vMax) * VOL} fill={isBo ? "#f59e0b" : up ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"} />
          </g>
        );
      })}
      {/* biên / viền cổ / cột cờ */}
      {p.lines.map((l) => {
        const x0 = xd(l.d0), x1 = xd(l.d1); if (x0 == null || x1 == null) return null;
        // kéo dài biên phá vỡ tới điểm phá vỡ (nếu có)
        const i0v = idx.get(l.d0)!, i1v = idx.get(l.d1)!;
        const ext = xBo != null && bo != null && xBo > x1 && i1v !== i0v ? { x: xBo, v: l.p0 + ((l.p1 - l.p0) * (bo - i0v)) / (i1v - i0v) } : null;
        return (
          <g key={l.name} data-testid="pring-line">
            <line x1={x0} y1={y(l.p0)} x2={x1} y2={y(l.p1)} stroke="#e2e8f0" strokeWidth={1.3} />
            {ext && inView(ext.v) && <line x1={x1} y1={y(l.p1)} x2={ext.x} y2={y(ext.v)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />}
            <text x={x0 + 2} y={y(l.p0) - 3} fontSize={7.5} fill="#cbd5e1">{l.name}</text>
          </g>
        );
      })}
      {curve && <polyline points={curve} fill="none" stroke="#a78bfa" strokeWidth={1.4} data-testid="pring-curve" />}
      {p.points.map((pt) => { const cx = xd(pt.date); if (cx == null) return null; return (
        <g key={pt.name} data-testid="pring-point">
          <circle cx={cx} cy={y(pt.price)} r={2.8} fill="#f8fafc" stroke="#0f172a" strokeWidth={0.6} />
          <text x={cx} y={y(pt.price) - 6} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#f8fafc">{pt.name}</text>
        </g>); })}
      {p.apexDate && xd(p.apexDate) != null && <circle cx={xd(p.apexDate)!} cy={y(p.levelNow ?? p.points[0].price)} r={2} fill="#fbbf24" data-testid="pring-apex"><title>Đỉnh tam giác</title></circle>}
      {/* mức thất bại & mục tiêu: từ điểm phá vỡ (hoặc cuối mô hình) tới nến cuối */}
      {p.failLevel != null && inView(p.failLevel) && (() => { const x0 = xBo ?? xd(p.endDate) ?? PL; return (
        <g data-testid="pring-fail"><line x1={x0} x2={xEnd} y1={y(p.failLevel)} y2={y(p.failLevel)} stroke="#f43f5e" strokeDasharray="4 3" strokeWidth={1} />
          <text x={xEnd - 2} y={y(p.failLevel) + 9} textAnchor="end" fontSize={7.5} fill="#fda4af">Thất bại (50%) {fmtP(p.failLevel)}</text></g>); })()}
      {p.targets.map((v, k) => (inView(v) ? (
        <g key={k} data-testid="pring-target"><line x1={xBo ?? xd(p.endDate) ?? PL} x2={xEnd} y1={y(v)} y2={y(v)} stroke={col} strokeDasharray="2 3" strokeWidth={1} opacity={1 - k * 0.25} />
          <text x={xEnd - 2} y={y(v) - 3} textAnchor="end" fontSize={7.5} fill={col}>Mục tiêu {k + 1}× {fmtP(v)}{p.targetsHit.some((h) => h.k === k + 1) ? " ✓" : ""}</text></g>
      ) : null))}
      {xBo != null && p.breakout && (
        <g data-testid="pring-breakout">
          {bull
            ? <path d={`M ${xBo} ${y(p.breakout.price) + 9} l -4 7 h 8 z`} fill="#f59e0b" />
            : <path d={`M ${xBo} ${y(p.breakout.price) - 9} l -4 -7 h 8 z`} fill="#f59e0b" />}
          <text x={xBo} y={y(p.breakout.price) + (bull ? 30 : -24)} textAnchor="middle" fontSize={7.5} fill="#fbbf24">Phá vỡ {p.breakout.date.slice(5)}</text>
        </g>
      )}
      {p.breakout?.confirmDate && xd(p.breakout.confirmDate) != null && <line x1={xd(p.breakout.confirmDate)!} x2={xd(p.breakout.confirmDate)!} y1={PT} y2={PT + g.plotH} stroke="rgba(251,191,36,0.35)" strokeDasharray="1 3" data-testid="pring-confirm"><title>Xác nhận (giữ 2 thanh)</title></line>}
      <line x1={PL} x2={xEnd} y1={y(lastClose)} y2={y(lastClose)} stroke="rgba(251,191,36,0.45)" strokeDasharray="2 3" />
      <rect x={xEnd + 1} y={y(lastClose) - 6} width={PR - 2} height={12} rx={2} fill="#f59e0b" />
      <text x={xEnd + 4} y={y(lastClose) + 3} fontSize={8} fontWeight={700} fill="#0f172a">{fmtP(lastClose)}</text>
      {view.map((b, i) => (i % labelEvery === 0 ? <text key={`t${b[0]}`} x={x(i)} y={H - 3} textAnchor="middle" fontSize={7.5} fill="#64748b">{p.timeframe === "W" ? b[0].slice(2, 7) : b[0].slice(5)}</text> : null))}
    </svg>
  );
}
