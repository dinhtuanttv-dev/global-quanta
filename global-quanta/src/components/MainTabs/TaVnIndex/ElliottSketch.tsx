// Phác đồ Elliott (E5): nến THẬT + đếm sóng của engine GET (0–5, A–C) ghim theo ngày vào nến, mức vô hiệu, cửa sổ sóng 5
// (sách), đếm sóng tuần (ký hiệu (n)) khi xem khung ngày, và khung Elliott Oscillator 5/35 với dải bứt phá 80% (T-20) —
// đánh dấu đỉnh dao động sóng 3 / sóng 5 để thấy trực tiếp điều kiện "sóng 3 mạnh nhất · phân kỳ sóng 5".
// Bên cạnh: sơ đồ mẫu 5–3 của sách (T-5…T-13) với vị trí sóng hiện tại. Màu theo WyckoffSketch (kiểm định trên nền tối).
import { useEffect, useMemo, useRef, useState } from "react";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import { elliottOscData, type ElliottState } from "../../../lib/quant-core/elliott";
import { elliottCountPoints } from "../../../lib/ta-command-center/chart/elliottScene";
import type { OscCount } from "../../../lib/quant-core/elliott/oscCount";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const AMBER = "#d97706";
const VIOLET = "#7c3aed";
const GRID = "rgba(148,163,184,0.14)";
const INK = "#cbd5e1";
const MUTED = "#94a3b8";
const BG = "#02060f";

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

export interface ElliottSketchProps {
  bars: OhlcvBar[];
  state: ElliottState;
  /** Đếm sóng bậc lớn hơn (tuần) đã ghim sang ngày. */
  higher?: { points: { date: string; price: number }[]; labels: string[] } | null;
  ticker: string;
  frame: "D" | "W";
  /** E2: đếm theo dao động — đánh dấu ◆ Đ3 / Đ4 / Đ5 tại giá. */
  osc?: OscCount | null;
}

export function elliottSketchWindow(bars: OhlcvBar[], state: ElliottState): { from: number; to: number } {
  const to = bars.length - 1;
  const cnt = elliottCountPoints(state);
  const start = cnt?.points[0]?.date;
  const idx = start ? bars.findIndex((b) => b.date >= start) : -1;
  return { from: Math.max(0, Math.min(idx >= 0 ? idx - 12 : to - 120, to - 60), to - 300), to };
}

export default function ElliottSketch({ bars, state, higher, ticker, frame, osc: oc = null }: ElliottSketchProps) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCompact(el.clientWidth < 480));
    ro.observe(el);
    setCompact(el.clientWidth < 480);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    if (bars.length < 40) return null;
    const { from, to } = elliottSketchWindow(bars, state);
    const view = bars.slice(from, to + 1);
    const oscAll = new Map(elliottOscData(bars).map((d) => [d.date, d]));
    const osc = view.map((b) => oscAll.get(b.date) ?? null);
    const cnt = elliottCountPoints(state);
    const sc = state.scenario;
    const levels: { price: number; label: string; color: string; dash?: string; band?: [number, number]; from?: string }[] = [];
    if (state.invalidation) levels.push({ price: state.invalidation.price, label: `Vô hiệu ${fmt(state.invalidation.price)}`, color: DOWN, dash: "5 3" });
    if (sc && (sc.status === "wave5-forming" || !sc.points[5]?.confirmed || sc.provisional)) {
      const w = sc.targets.wave5.window03;
      levels.push({ price: (w.low + w.high) / 2, label: `Cửa sổ sóng 5 ${fmt(Math.min(w.low, w.high))}–${fmt(Math.max(w.low, w.high))}`, color: AMBER, band: [Math.min(w.low, w.high), Math.max(w.low, w.high)], from: String(sc.points[4].time) });
    } else if (sc?.afterWave5) {
      levels.push({ price: sc.afterWave5.firstTarget, label: `Mục tiêu điều chỉnh (đáy/đỉnh sóng 4) ${fmt(sc.afterWave5.firstTarget)}`, color: ACCENT, dash: "2 3", from: String(sc.points[5].time) });
    }
    const viewHi = Math.max(...view.map((b) => b.high)), viewLo = Math.min(...view.map((b) => b.low)), span = viewHi - viewLo;
    const shown = levels.filter((l) => l.price <= viewHi + 0.6 * span && l.price >= viewLo - 0.6 * span);
    const prices = [...view.flatMap((b) => [b.high, b.low]), ...shown.flatMap((l) => (l.band ? l.band : [l.price]))];
    let lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    const oVals = osc.flatMap((d) => (d ? [d.osc, d.up, d.lo] : []));
    const oMax = Math.max(1e-9, ...oVals.map(Math.abs));
    return { from, view, osc, oMax, cnt, levels: shown, hidden: levels.filter((l) => !shown.includes(l)), lo, hi };
  }, [bars, state]);

  if (!model) return <div className="text-[10px] text-slate-500 py-6 text-center">Chưa đủ dữ liệu nến để dựng phác đồ Elliott.</div>;
  const { view, osc, oMax, cnt, levels, hidden, lo, hi, from } = model;
  const W = compact ? 360 : 640, PH = compact ? 200 : 240, OH = compact ? 56 : 70, GAP = 8, H = PH + GAP + OH, R = compact ? 0 : 180, plotW = W - R;
  const bw = plotW / view.length;
  const x = (i: number) => i * bw + bw / 2;
  const y = (v: number) => PH - ((v - lo) / (hi - lo || 1)) * PH;
  const oy0 = PH + GAP + OH / 2, oy = (v: number) => oy0 - (v / oMax) * (OH / 2 - 2);
  const idxOf = new Map(view.map((b, i) => [b.date, i]));
  const xOf = (d: string | null | undefined) => (d != null && idxOf.has(d) ? x(idxOf.get(d)!) : null);
  const xEnd = x(view.length - 1);
  const up = state.dir === "up", cc = up ? UP : DOWN;

  const pts = (cnt?.points ?? []).map((p, k) => ({ ...p, label: cnt!.labels[k], px: xOf(p.date) }));
  const visible = pts.filter((p) => p.px != null);
  const poly = visible.map((p) => `${p.px},${y(p.price)}`).join(" ");
  const hPts = (higher?.points ?? []).map((p, k) => ({ ...p, label: higher!.labels[k], px: xOf(p.date) })).filter((p) => p.px != null);

  // Đỉnh dao động trong sóng 3 / sóng 5 (theo cách đếm) — để đọc phân kỳ ngay trên khung dao động.
  const sgn = up ? 1 : -1;
  const peakIn = (a?: string, b?: string) => {
    const i0 = a != null ? idxOf.get(a) : undefined, i1 = b != null ? idxOf.get(b) : undefined;
    if (i0 == null || i1 == null) return null;
    let best: { i: number; v: number } | null = null;
    for (let i = i0; i <= i1; i++) { const d = osc[i]; if (d && (!best || sgn * d.osc > sgn * best.v)) best = { i, v: d.osc }; }
    return best;
  };
  const p3 = peakIn(pts[2]?.date, pts[3]?.date), p5 = pts.length >= 6 ? peakIn(pts[4]?.date, pts[5]?.date) : null;

  const labels = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 11) labels[i].ly = labels[i - 1].ly + 11;
  const hb = hover != null ? view[hover] : null, ho = hover != null ? osc[hover] : null;

  return (
    <div className="relative" data-testid="elliott-sketch" data-frame={frame} ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Phác đồ Elliott ${ticker} khung ${frame === "W" ? "tuần" : "ngày"}: ${state.label}, từ ${view[0].date} tới ${view[view.length - 1].date}`}
        onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={plotW} y1={PH * f} y2={PH * f} stroke={GRID} />)}
        {levels.filter((l) => l.band).map((l) => {
          const lx = l.from ? xOf(l.from) ?? 0 : 0;
          return <rect key={l.label} x={lx} width={Math.max(2, plotW - lx)} y={y(l.band![1])} height={Math.max(3, y(l.band![0]) - y(l.band![1]))} fill={AMBER} opacity={0.16} stroke={AMBER} strokeOpacity={0.5} strokeDasharray="2 3" />;
        })}
        {view.map((b, i) => {
          const u = b.close >= b.open, c = u ? UP : DOWN;
          const top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
          return (
            <g key={b.date} opacity={0.75}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth={1} />
              <rect x={x(i) - Math.max(0.6, bw * 0.32)} width={Math.max(1.2, bw * 0.64)} y={top} height={Math.max(1, bot - top)} fill={u ? c : BG} stroke={c} strokeWidth={u ? 0 : 1} />
            </g>
          );
        })}
        {levels.filter((l) => !l.band).map((l) => {
          const lx = l.from ? xOf(l.from) ?? 0 : 0;
          return <line key={`l${l.label}`} x1={lx} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={1.3} strokeDasharray={l.dash} />;
        })}
        {hPts.length >= 2 && <polyline points={hPts.map((p) => `${p.px},${y(p.price)}`).join(" ")} fill="none" stroke={VIOLET} strokeWidth={1.2} strokeDasharray="6 4" />}
        {hPts.map((p, k) => (
          <text key={`h${k}`} x={p.px!} y={k % 2 === (up ? 1 : 0) ? Math.min(PH - 2, y(p.price) + 22) : Math.max(9, y(p.price) - 16)} textAnchor="middle" fontSize={9} fontWeight={800} fill={VIOLET}>{p.label}</text>
        ))}
        {poly && <polyline points={poly} fill="none" stroke={cc} strokeWidth={1.8} strokeDasharray={state.scenario ? undefined : "4 3"} />}
        {visible.map((p) => {
          // Nhãn đặt phía ngoài cực trị: đỉnh ở trên, đáy ở dưới (sóng giảm thì 0/2/4/A/C là đỉnh).
          const py = y(p.price), base = p.label.replace("?", "");
          const top = (up ? ["1", "3", "5", "B"] : ["0", "2", "4", "A", "C"]).includes(base);
          const pending = p.label.endsWith("?");
          return (
            <g key={`p${p.label}${p.date}`}>
              <circle cx={p.px!} cy={py} r={3.5} fill={BG} stroke={cc} strokeWidth={1.8} strokeDasharray={pending ? "1.5 1.5" : undefined} />
              <text x={p.px!} y={top ? Math.max(9, py - 7) : Math.min(PH - 2, py + 13)} textAnchor="middle" fontSize={10} fontWeight={800} fill={INK}>{p.label}</text>
            </g>
          );
        })}
        {oc && ([["Đ3", oc.w3], ["Đ4", oc.w4], ["Đ5", oc.w5]] as const).map(([t, p]) => {
          const px = p ? xOf(p.date) : null;
          if (!p || px == null) return null;
          const py = y(p.price), top = (t === "Đ4") !== up ? false : true;
          return (
            <g key={t} data-testid={`sketch-osc-${t}`}>
              <path d={`M${px},${py - 5} l4,5 l-4,5 l-4,-5 z`} fill={AMBER} stroke={BG} strokeWidth={1} />
              <text x={px + 6} y={top ? py - 6 : py + 12} fontSize={8.5} fontWeight={800} fill={AMBER}>{t}</text>
            </g>
          );
        })}
        <circle cx={xEnd} cy={y(view[view.length - 1].close)} r={3} fill={INK} />
        {/* Elliott Oscillator 5/35 */}
        <rect x={0} y={PH + GAP} width={plotW} height={OH} fill="rgba(148,163,184,0.04)" />
        <line x1={0} x2={plotW} y1={oy0} y2={oy0} stroke={GRID} />
        {osc.map((d, i) => {
          if (!d) return null;
          const strong = (d.osc > 0 && d.up > 0 && d.osc > d.up) || (d.osc < 0 && d.lo < 0 && d.osc < d.lo);
          const yy = oy(d.osc);
          return <rect key={`o${i}`} x={x(i) - Math.max(0.5, bw * 0.35)} width={Math.max(1, bw * 0.7)} y={Math.min(yy, oy0)} height={Math.max(0.5, Math.abs(yy - oy0))} fill={d.osc >= 0 ? UP : DOWN} opacity={strong ? 0.95 : 0.4} />;
        })}
        <polyline points={osc.map((d, i) => (d ? `${x(i)},${oy(d.up)}` : "")).filter(Boolean).join(" ")} fill="none" stroke={UP} strokeOpacity={0.6} strokeDasharray="3 2" strokeWidth={1} />
        <polyline points={osc.map((d, i) => (d ? `${x(i)},${oy(d.lo)}` : "")).filter(Boolean).join(" ")} fill="none" stroke={DOWN} strokeOpacity={0.6} strokeDasharray="3 2" strokeWidth={1} />
        {p3 && <text x={x(p3.i)} y={up ? oy(p3.v) - 3 : oy(p3.v) + 9} textAnchor={x(p3.i) > plotW - 40 ? "end" : x(p3.i) < 40 ? "start" : "middle"} fontSize={8.5} fontWeight={800} fill={INK}>đỉnh DĐ 3</text>}
        {p5 && <text x={x(p5.i)} y={up ? oy(p5.v) - 3 : oy(p5.v) + 9} textAnchor={x(p5.i) > plotW - 60 ? "end" : "middle"} fontSize={8.5} fontWeight={800} fill={INK}>{Math.abs(p5.v) < Math.abs(p3?.v ?? Infinity) ? "DĐ 5 · phân kỳ" : "DĐ 5 · không phân kỳ"}</text>}
        <text x={3} y={PH + GAP + 9} fontSize={8.5} fill={MUTED}>Elliott Oscillator 5/35 · dải 80%</text>
        {!compact && labels.map((l) => (
          <g key={`t${l.label}`}>
            <line x1={plotW + 2} x2={plotW + 12} y1={l.ly} y2={l.ly} stroke={l.color} strokeWidth={2} strokeDasharray={l.band ? undefined : l.dash} />
            <text x={plotW + 15} y={l.ly + 3} fontSize={9} fill={INK}>{l.label}</text>
          </g>
        ))}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H} stroke={MUTED} strokeWidth={1} strokeDasharray="2 2" />}
        {view.map((b, i) => (
          <rect key={`h${b.date}`} x={i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hb && (
        <div className="absolute top-1 left-1 rounded-md px-2 py-1 text-[9px] font-mono text-slate-200 pointer-events-none"
          style={{ background: "rgba(2,6,15,0.92)", border: "1px solid rgba(148,163,184,0.25)" }} data-testid="elliott-sketch-tooltip">
          {hb.date} · O {fmt(hb.open)} H {fmt(hb.high)} L {fmt(hb.low)} C {fmt(hb.close)}{ho ? ` · DĐ ${ho.osc.toFixed(2)}` : ""}
        </div>
      )}
      {compact && levels.length > 0 && (
        <ul className="grid grid-cols-1 gap-y-0.5 text-[10px] mt-1" data-testid="elliott-sketch-levels">
          {[...levels].sort((a, b) => b.price - a.price).map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 min-w-0">
              <svg width="14" height="6" aria-hidden="true" className="shrink-0"><line x1="0" x2="14" y1="3" y2="3" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} /></svg>
              <span className="text-slate-300 truncate">{l.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400 mt-1">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: cc }} />Đếm sóng {frame === "W" ? "tuần" : "ngày"}</span>
        {hPts.length >= 2 && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: VIOLET }} />(n) đếm sóng tuần</span>}
        <span>● đã xác nhận · ◌? chưa xác nhận</span>
        {oc?.w3 && <span style={{ color: AMBER }}>◆ Đ3–Đ5: đếm theo dao động</span>}
        <span>cột đậm = dao động vượt dải 80%</span>
        <span className="ml-auto text-slate-500">{view[0].date} → {view[view.length - 1].date} · {from > 0 ? `${view.length} nến` : "toàn bộ"}</span>
      </div>
      {hidden.length > 0 && <p className="text-[9px] text-slate-500 mt-0.5">Ngoài khung: {hidden.map((l) => l.label).join(" · ")}</p>}
    </div>
  );
}

/** Sơ đồ mẫu 5–3 của sách (T-5…T-13): giá + dao động; tô sáng sóng hiện tại của kịch bản. */
export function ElliottSchematic({ wave, dir }: { wave: ElliottState["wave"]; dir: "up" | "down" | null }) {
  const W = 300, PH = 120, OH = 46, H = PH + 8 + OH;
  // Giá mẫu (0…1) cho 0-1-2-3-4-5-A-B-C và đỉnh dao động mỗi sóng (sóng 3 mạnh nhất, sóng 4 kéo về ~0, sóng 5 phân kỳ).
  const P = [0.08, 0.36, 0.2, 0.78, 0.6, 0.92, 0.62, 0.76, 0.42];
  const O = [0, 0.45, 0.08, 1, -0.05, 0.55, -0.6, -0.15, -0.75];
  const name = ["0", "1", "2", "3", "4", "5", "A", "B", "C"];
  const sx = (k: number) => 14 + (k / (P.length - 1)) * (W - 28);
  const flip = dir === "down";
  const sy = (v: number) => 8 + (flip ? v : 1 - v) * (PH - 16);
  const cur = wave === "post" ? 8 : name.indexOf(wave);
  const oy0 = PH + 8 + OH / 2, oy = (v: number) => oy0 - (flip ? -v : v) * (OH / 2 - 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sơ đồ mẫu 5 sóng đẩy + 3 sóng điều chỉnh theo sách GET" data-testid="elliott-schematic">
      <polyline points={P.map((v, k) => `${sx(k)},${sy(v)}`).join(" ")} fill="none" stroke={MUTED} strokeWidth={1.4} />
      {cur > 0 && <polyline points={[cur - 1, cur].map((k) => `${sx(k)},${sy(P[k])}`).join(" ")} fill="none" stroke={AMBER} strokeWidth={3} />}
      {P.map((v, k) => {
        const top = flip ? [0, 2, 4, 7].includes(k) : [1, 3, 5, 7].includes(k);
        return (
          <g key={k}>
            <circle cx={sx(k)} cy={sy(v)} r={2.5} fill={k === cur ? AMBER : BG} stroke={MUTED} />
            <text x={sx(k)} y={top ? sy(v) - 6 : sy(v) + 12} textAnchor="middle" fontSize={9} fontWeight={800} fill={k === cur ? AMBER : INK}>{name[k]}</text>
          </g>
        );
      })}
      <line x1={8} x2={W - 8} y1={oy0} y2={oy0} stroke={GRID} />
      {O.map((v, k) => k === 0 ? null : (
        <rect key={`o${k}`} x={(sx(k - 1) + sx(k)) / 2 - 9} width={18} y={Math.min(oy(v), oy0)} height={Math.max(1, Math.abs(oy(v) - oy0))} fill={(flip ? -v : v) >= 0 ? UP : DOWN} opacity={k === cur ? 0.95 : 0.45} />
      ))}
      <text x={10} y={PH + 18} fontSize={8} fill={MUTED}>Dao động: sóng 3 mạnh nhất · sóng 4 về ~0 · sóng 5 phân kỳ</text>
    </svg>
  );
}
