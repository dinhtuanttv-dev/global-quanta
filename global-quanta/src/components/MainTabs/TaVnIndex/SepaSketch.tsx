// "Mô phỏng mẫu hình SEPA trên giá thật" — nến điều chỉnh (cùng cơ sở giá với Gateway) + hình học của bộ lọc, GHIM THEO NGÀY vào nến:
//   VCP          các lần thu hẹp T1…Tn (đỉnh → đáy, nhãn −x%) như Hình 10.38 / 10.6, vùng pivot chặt bên phải
//   Nền phẳng    hộp nền 4–7 tuần · Cốc–tay cầm: đường cốc + tay cầm · 3-C / low cheat: vùng tạm ngưng (cheat) trong cốc
//   Cờ cao       pha đâm + lá cờ · Nền đầu tiên: hộp từ đỉnh sau niêm yết
// Chung: MA50/150/200 (Trend Template), pivot, vùng mua pivot → +5% (s.265), dừng lỗ, 2R; ▲ phiên phá vỡ;
// khung khối lượng: TB 50 phiên, phiên KL cạn kiệt (< 50% TB50) trong vùng pivot được khoanh (Hình 10.8), phiên phá vỡ tô đậm.
import { useEffect, useMemo, useRef, useState } from "react";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import type { SepaRow } from "../../../hooks/useSepa";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const AMBER = "#d97706";
const GRID = "rgba(148,163,184,0.14)";
const INK = "#cbd5e1";
const MUTED = "#94a3b8";
const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

interface Level { price: number; label: string; color: string; dash?: string; band?: [number, number] }

function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = []; let s = 0;
  for (let i = 0; i < values.length; i++) { s += values[i]; if (i >= n) s -= values[i - n]; out.push(i >= n - 1 ? s / n : null); }
  return out;
}

export function sepaWindow(bars: OhlcvBar[], row: SepaRow): { from: number; to: number } {
  const start = row.pattern?.baseStart ?? null;
  const to = bars.length - 1;
  const idx = start ? bars.findIndex((b) => b.date >= start) : -1;
  const from = Math.max(0, Math.min(idx >= 0 ? idx - 25 : to - 120, to - 60), to - 300);
  return { from, to };
}

export default function SepaSketch({ bars, row }: { bars: OhlcvBar[]; row: SepaRow }) {
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
    if (bars.length < 30) return null;
    const { from, to } = sepaWindow(bars, row);
    const closes = bars.map((b) => b.close);
    const ma = { 50: sma(closes, 50), 150: sma(closes, 150), 200: sma(closes, 200) };
    const view = bars.slice(from, to + 1);
    const vols = bars.map((b) => b.volume);
    const v50 = sma(vols, 50);
    const p = row.pattern, plan = row.plan;
    const levels: Level[] = [];
    if (p?.pivot) {
      levels.push({ price: p.pivot, label: `Pivot ${fmt(p.pivot)}`, color: INK, dash: "5 3" });
      levels.push({ price: p.pivot * 1.05, label: "Vùng mua (pivot → +5%)", color: UP, band: [p.pivot, p.pivot * 1.05] });
    }
    if (plan?.stop) levels.push({ price: plan.stop, label: `Dừng lỗ ${fmt(plan.stop)} (−${(plan.stopPct * 100).toFixed(1).replace(".", ",")}%)`, color: DOWN, dash: "2 3" });
    if (plan?.target2r) levels.push({ price: plan.target2r, label: `2R ${fmt(plan.target2r)}`, color: UP, dash: "7 3" });
    const maInView = [50, 150, 200].flatMap((n) => ma[n as 50].slice(from, to + 1).filter((v): v is number => v != null));
    const prices = [...view.flatMap((b) => [b.high, b.low]), ...levels.flatMap((l) => (l.band ? l.band : [l.price])), ...maInView].filter(Number.isFinite);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    return { from, to, view, levels, lo, hi, ma, v50, p };
  }, [bars, row]);

  if (!model) return <div className="text-[10px] text-slate-500 py-6 text-center">Chưa đủ dữ liệu nến để dựng mô phỏng.</div>;
  const { from, view, levels, lo, hi, ma, v50, p } = model;
  const W = compact ? 360 : 640, PH = compact ? 210 : 240, VH = 54, GAP = 8, H = PH + GAP + VH, R = compact ? 0 : 140, plotW = W - R;
  const bw = plotW / view.length;
  const x = (i: number) => i * bw + bw / 2;
  const y = (v: number) => PH - ((v - lo) / (hi - lo || 1)) * PH;
  const idxOf = (d?: string | null) => (d ? view.findIndex((b) => b.date === d) : -1); // ghim: chỉ ngày có nến
  const geq = (d?: string | null) => (d ? view.findIndex((b) => b.date >= d) : -1);

  const det = p?.details ?? {};
  const cons = (p?.name === "VCP" ? det.thu_hep_chi_tiet ?? [] : []);
  const pcts = det.cac_lan_thu_hep_pct ?? [];
  const boIdx = idxOf(p?.breakout?.ngay_pha_vo as string | undefined);
  const baseIdx = geq(p?.baseStart);
  const maxV = Math.max(1, ...view.map((b) => b.volume));
  const vy = (v: number) => PH + GAP + VH - (v / maxV) * (VH - 2);
  const pivotWin = Math.max(0, view.length - 10);
  const dry = view.map((b, i) => {
    const a = v50[from + i];
    return i >= pivotWin && boIdx < 0 && a != null && b.volume < 0.5 * a;
  });
  // hình học riêng của từng mô hình
  let shape: React.ReactNode = null;
  if (p && p.name !== "VCP" && baseIdx >= 0) {
    const x0 = x(baseIdx) - bw / 2, x1 = x(view.length - 1) + bw / 2;
    if (p.name === "Cốc–tay cầm") {
      const lowI = baseIdx + Number(det.so_phien_giam ?? 0), rimI = lowI + Number(det.so_phien_hoi ?? 0);
      if (rimI < view.length) {
        const yl = y(Number(det.dinh_trai)), yb = y(Number(det.day_coc)), yr = y(Number(det.vanh_phai));
        shape = (
          <g>
            <path d={`M${x(baseIdx)},${yl} C${x(baseIdx) + (x(lowI) - x(baseIdx)) * 0.2},${yb} ${x(lowI) - (x(lowI) - x(baseIdx)) * 0.4},${yb} ${x(lowI)},${yb} C${x(lowI) + (x(rimI) - x(lowI)) * 0.4},${yb} ${x(rimI) - (x(rimI) - x(lowI)) * 0.2},${yr} ${x(rimI)},${yr}`}
              fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" />
            {p.stopRef != null && <rect x={x(rimI)} width={Math.max(2, x1 - x(rimI))} y={y(Number(det.vanh_phai))} height={Math.max(2, y(p.stopRef) - y(Number(det.vanh_phai)))} fill="none" stroke={ACCENT} strokeDasharray="3 2" rx={3} />}
          </g>
        );
      }
    } else if (p.name === "3-C" || p.name === "Low cheat") {
      const k = Number(det.so_phien_tam_ngung ?? 0), ps = Math.max(0, view.length - k);
      shape = (
        <g>
          {p.pivot != null && p.stopRef != null && <rect x={x(ps) - bw / 2} width={Math.max(2, x1 - x(ps) + bw / 2)} y={y(p.pivot)} height={Math.max(2, y(p.stopRef) - y(p.pivot))} fill={AMBER} opacity={0.18} stroke={AMBER} strokeWidth={1} rx={3} />}
          <text x={x(ps)} y={Math.max(10, (p.pivot != null ? y(p.pivot) : 12) - 4)} fontSize={9} fontWeight={700} fill={INK}>{p.name === "3-C" ? "Vùng cheat 3-C" : "Low cheat"}</text>
        </g>
      );
    } else if (p.pivot != null && p.stopRef != null) {
      shape = <rect x={x0} width={Math.max(2, x1 - x0)} y={y(p.pivot)} height={Math.max(2, y(p.stopRef) - y(p.pivot))} fill={ACCENT} opacity={0.12} stroke={ACCENT} strokeWidth={1} rx={3} />;
    }
  }
  const labels = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 11) labels[i].ly = labels[i - 1].ly + 11;
  const maPath = (n: 50 | 150 | 200) => {
    let d = ""; view.forEach((_, i) => { const v = ma[n][from + i]; if (v != null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    return d;
  };
  const hb = hover != null ? view[hover] : null;
  return (
    <div className="relative" ref={boxRef} data-testid="sepa-sketch">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" onMouseLeave={() => setHover(null)}
        aria-label={`Mô phỏng ${p?.name ?? "SEPA"} của ${row.ticker} trên giá thật từ ${view[0].date} tới ${view[view.length - 1].date}`}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={plotW} y1={PH * f} y2={PH * f} stroke={GRID} />)}
        {levels.filter((l) => l.band).map((l) => <rect key={l.label} x={0} width={plotW} y={y(l.band![1])} height={Math.max(2, y(l.band![0]) - y(l.band![1]))} fill={l.color} opacity={0.1} />)}
        {shape}
        {/* MA của Trend Template */}
        <path d={maPath(50)} fill="none" stroke={MUTED} strokeWidth={1} opacity={0.9} data-testid="sepa-ma50" />
        <path d={maPath(150)} fill="none" stroke={MUTED} strokeWidth={1} strokeDasharray="4 2" opacity={0.7} />
        <path d={maPath(200)} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="1 2" opacity={0.8} />
        {view.map((b, i) => {
          const up = b.close >= b.open, c = up ? UP : DOWN, top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
          return (
            <g key={b.date}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth={1} />
              <rect x={x(i) - Math.max(0.6, bw * 0.32)} width={Math.max(1.2, bw * 0.64)} y={top} height={Math.max(1, bot - top)} fill={up ? c : "#02060f"} stroke={c} strokeWidth={up ? 0 : 1} />
            </g>
          );
        })}
        {/* các lần thu hẹp VCP: đỉnh -> đáy, ghim ngày */}
        {cons.map((c, k) => {
          const a = idxOf(c.ngay_dinh), b = idxOf(c.ngay_day);
          if (a < 0 || b < 0) return null;
          const last = k === cons.length - 1;
          return (
            <g key={`t${k}`} data-testid="sepa-contraction">
              <line x1={x(a)} y1={y(c.dinh)} x2={x(Math.max(b, a))} y2={y(c.day)} stroke={AMBER} strokeWidth={last ? 2.2 : 1.6} strokeDasharray={last ? undefined : "5 3"} />
              <circle cx={x(a)} cy={y(c.dinh)} r={2.5} fill={AMBER} />
              <circle cx={x(b)} cy={y(c.day)} r={2.5} fill={AMBER} />
              <text x={x(b)} y={Math.min(PH - 2, y(c.day) + 12)} fontSize={9} fontWeight={700} fill={INK} textAnchor="middle">T{k + 1} −{String(pcts[k] ?? Math.round((1 - c.day / c.dinh) * 1000) / 10).replace(".", ",")}%</text>
            </g>
          );
        })}
        {levels.filter((l) => !l.band).map((l) => <line key={`l${l.label}`} x1={0} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={1.4} strokeDasharray={l.dash} />)}
        {boIdx >= 0 && (
          <g data-testid="sepa-breakout-mark">
            <path d={`M${x(boIdx)},${y(view[boIdx].low) + 6} l5,9 l-10,0 z`} fill={UP} stroke="#02060f" strokeWidth={1} />
            <text x={x(boIdx)} y={Math.max(9, y(view[boIdx].high) - 6)} fontSize={8.5} fontWeight={700} fill={INK} textAnchor="middle">phá vỡ</text>
          </g>
        )}
        {!compact && labels.map((l) => (
          <g key={`t${l.label}`}>
            <line x1={plotW + 2} x2={plotW + 12} y1={l.ly} y2={l.ly} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} />
            <text x={plotW + 15} y={l.ly + 3} fontSize={9} fill={INK}>{l.label}</text>
          </g>
        ))}
        {/* khung khối lượng */}
        <line x1={0} x2={plotW} y1={PH + GAP + VH - 0.5} y2={PH + GAP + VH - 0.5} stroke={GRID} />
        {view.map((b, i) => {
          const up = b.close >= b.open, c = up ? UP : DOWN, top = vy(b.volume), strong = i === boIdx;
          return <rect key={`v${b.date}`} x={i * bw + bw * 0.15} width={Math.max(1, bw * 0.7)} y={top} height={Math.max(1, PH + GAP + VH - top)} fill={strong ? c : up ? c : "none"} stroke={c} strokeWidth={up || strong ? 0 : 0.8} opacity={strong ? 1 : 0.7} />;
        })}
        {(() => { let d = ""; view.forEach((_, i) => { const a = v50[from + i]; if (a != null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${vy(a).toFixed(1)}`; }); return <path d={d} fill="none" stroke={MUTED} strokeDasharray="4 3" />; })()}
        {dry.map((on, i) => on ? <circle key={`d${i}`} cx={x(i)} cy={vy(view[i].volume) - 4} r={Math.max(3, bw * 0.7)} fill="none" stroke={AMBER} strokeWidth={1.4} data-testid="sepa-dryup" /> : null)}
        {!compact && <text x={plotW + 15} y={PH + GAP + 12} fontSize={9} fill={INK}>Khối lượng · TB50 (- -)</text>}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H} stroke={MUTED} strokeWidth={1} strokeDasharray="2 2" />}
        {view.map((b, i) => <rect key={`h${b.date}`} x={i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />)}
      </svg>
      {hb && (
        <div className="absolute top-1 left-1 rounded-md px-2 py-1 text-[9px] font-mono text-slate-200 pointer-events-none" style={{ background: "rgba(2,6,15,0.92)", border: "1px solid rgba(148,163,184,0.25)" }} data-testid="sepa-sketch-tooltip">
          {hb.date} · O {fmt(hb.open)} H {fmt(hb.high)} L {fmt(hb.low)} C {fmt(hb.close)} · KL {fmt(hb.volume)}
          {v50[from + hover!] != null && ` (${(hb.volume / (v50[from + hover!] as number)).toFixed(2).replace(".", ",")}× TB50)`}
        </div>
      )}
      {compact && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] mt-1" data-testid="sepa-sketch-levels">
          {[...levels].sort((a, b) => b.price - a.price).map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 min-w-0">
              <svg width="14" height="6" aria-hidden="true" className="shrink-0"><line x1="0" x2="14" y1="3" y2="3" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} /></svg>
              <span className="text-slate-300 truncate">{l.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400 mt-1">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: UP }} />Nến tăng</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ border: `1px solid ${DOWN}` }} />Nến giảm</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t" style={{ borderColor: MUTED }} />MA50</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed" style={{ borderColor: MUTED }} />MA150</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t border-dotted" style={{ borderColor: MUTED }} />MA200</span>
        {cons.length > 0 && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: AMBER }} />Lần thu hẹp T</span>}
        {dry.some(Boolean) && <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full border" style={{ borderColor: AMBER }} />KL cạn kiệt &lt; 50% TB50</span>}
        <span className="ml-auto text-slate-500">{view[0].date} → {view[view.length - 1].date} · {view.length} phiên</span>
      </div>
    </div>
  );
}
