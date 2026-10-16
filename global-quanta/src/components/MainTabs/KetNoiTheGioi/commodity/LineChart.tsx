// Biểu đồ đường SVG (không thư viện): MỘT trục, crosshair + tooltip, chú giải + nhãn trực tiếp cuối đường (≤ 4 đường),
// lưới mờ. Màu theo ĐỐI TƯỢNG (không theo thứ hạng) — bảng màu đã kiểm định cho nền tối (dataviz validate_palette: PASS).
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export const SERIES_COLORS = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", s4: "#c98500" } as const;

export interface ChartSeries { key: string; label: string; color: string; points: [string, number][] }

const toMs = (d: string) => (d.length === 7 ? Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 15) : Date.parse(`${d}T00:00:00Z`));
const fmtDate = (d: string) => (d.length === 7 ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);

function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function nearest(points: [string, number][], ms: number): [string, number] | null {
  let lo = 0, hi = points.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (toMs(points[m][0]) < ms) lo = m; else hi = m; }
  return Math.abs(toMs(points[lo][0]) - ms) <= Math.abs(toMs(points[hi][0]) - ms) ? points[lo] : points[hi];
}

export default function LineChart({ series, height = 220, yFmt = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }), refLines = [], testId, ariaLabel, directLabels = true }: {
  series: ChartSeries[]; height?: number; yFmt?: (v: number) => string; refLines?: { y: number; label: string }[]; testId?: string; ariaLabel: string; directLabels?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const live = series.filter((s) => s.points.length > 1);
  const showLabels = directLabels && live.length > 1 && live.length <= 4 && width >= 420;
  const M = { l: 44, r: showLabels ? 92 : 12, t: 8, b: 22 };
  const geo = useMemo(() => {
    const all = live.flatMap((s) => s.points);
    if (!all.length) return null;
    const xs = all.map((p) => toMs(p[0])), ys = [...all.map((p) => p[1]), ...refLines.map((r) => r.y)];
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.06 || Math.abs(y1) * 0.05 || 1;
    y0 -= pad; y1 += pad;
    const W = width - M.l - M.r, H = height - M.t - M.b;
    const sx = (ms: number) => M.l + ((ms - x0) / (x1 - x0 || 1)) * W;
    const sy = (v: number) => M.t + H - ((v - y0) / (y1 - y0 || 1)) * H;
    return { x0, x1, y0, y1, W, H, sx, sy };
  }, [live, refLines, width, height, M.l, M.r, M.t, M.b]);
  if (!geo) return <p className="text-[10px] italic" style={{ color: "var(--text-tertiary)" }}>Chưa đủ dữ liệu để vẽ.</p>;
  const { sx, sy, x0, x1, H } = geo;
  const yt = niceTicks(geo.y0, geo.y1);
  const xt = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const path = (pts: [string, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(toMs(p[0])).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
  // nhãn trực tiếp: tránh chồng (giãn tối thiểu 12px)
  const ends = live.map((s) => ({ s, y: sy(s.points[s.points.length - 1][1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(x0 + ((px) / (r.width || 1)) * (x1 - x0));
  };
  const hv = hover != null ? live.map((s) => ({ s, p: nearest(s.points, hover) })).filter((h) => h.p) : [];
  const hx = hv.length ? sx(toMs(hv[0].p![0])) : null;
  return (
    <div ref={wrap} className="w-full" data-testid={testId} style={{ position: "relative" }}>
      {live.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1" aria-hidden="true">
          {live.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[9.5px]" style={{ color: "var(--text-secondary)" }}>
              <span style={{ width: 12, height: 2, background: s.color, display: "inline-block", borderRadius: 2 }} />{s.label}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: "block", touchAction: "pan-y" }}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke="rgba(148,163,184,0.12)" />
            <text x={M.l - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{yFmt(v)}</text>
          </g>
        ))}
        {xt.map((ms, i) => (
          <text key={i} x={sx(ms)} y={height - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="9" fill="var(--text-tertiary)">
            {new Date(ms).toISOString().slice(0, 7).split("-").reverse().join("/")}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={M.l} x2={width - M.r} y1={sy(r.y)} y2={sy(r.y)} stroke="rgba(148,163,184,0.55)" strokeDasharray="4 3" />
            <text x={M.l + 4} y={sy(r.y) - 3} textAnchor="start" fontSize="8.5" fill="var(--text-tertiary)">{r.label}</text>
          </g>
        ))}
        {live.map((s) => <path key={s.key} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {showLabels && ends.map(({ s, y }) => (
          <g key={s.key}>
            <circle cx={sx(toMs(s.points[s.points.length - 1][0]))} cy={sy(s.points[s.points.length - 1][1])} r={3} fill={s.color} stroke="#0b1220" strokeWidth={2} />
            <text x={width - M.r + 6} y={y + 3} fontSize="9" fill="var(--text-secondary)">{yFmt(s.points[s.points.length - 1][1])} · {s.label.split(" (")[0].slice(0, 12)}</text>
          </g>
        ))}
        {hx != null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={M.t} y2={M.t + H} stroke="rgba(226,232,240,0.45)" />
            {hv.map(({ s, p }) => <circle key={s.key} cx={sx(toMs(p![0]))} cy={sy(p![1])} r={4} fill={s.color} stroke="#0b1220" strokeWidth={2} />)}
          </g>
        )}
        <rect x={M.l} y={M.t} width={Math.max(1, width - M.l - M.r)} height={H} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hx != null && hv.length > 0 && (
        <div role="status" className="text-[10px] rounded-md px-2 py-1.5"
          style={{ position: "absolute", top: 18, left: Math.min(Math.max(hx + 10, 0), width - 190), width: 180, background: "rgba(2,6,15,0.95)", border: "1px solid rgba(148,163,184,0.25)", color: "#f1f5f9", pointerEvents: "none" }}>
          <div style={{ color: "var(--text-tertiary)" }}>{fmtDate(hv[0].p![0])}</div>
          {hv.map(({ s, p }) => (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 truncate"><span style={{ width: 8, height: 2, background: s.color, display: "inline-block" }} /><span className="truncate">{s.label.split(" (")[0]}</span></span>
              <b>{yFmt(p![1])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
