// "Mô phỏng mẫu hình Wyckoff" của bảng phụ Hợp lưu v2 (H3): nến THẬT + cấu trúc Wyckoff đang hoạt động, ghim theo NGÀY vào nến.
//   Range (SC/AR … biên trên/dưới), Creek / ICE, sự kiện (SC, AR, ST, Spring #n, Test, SOS, LPS, UT, SOW, LPSY…),
//   dải Phase A–E ngay dưới biểu đồ (pha hiện tại viền cam), vùng hợp lưu cùng chiều (Wyckoff ∩ OB ∩ FVG ∩ POC ∩ AVWAP),
//   OB / FVG còn hiệu lực cùng chiều, các lần mua đã khớp (L1/L2/L3), cắt lỗ, mục tiêu.
// Màu theo PatternSketch (đã kiểm định trên nền tối): tăng #059669 / giảm #e11d48 (nến tăng ĐẶC, giảm RỖNG), cấu trúc #0284c7,
// hợp lưu #d97706. Mọi mức giá có NHÃN CHỮ (màu chữ), không dựa vào màu đường.
import { useEffect, useMemo, useRef, useState } from "react";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import type { ConvergenceResultV2 } from "../../../lib/quant-core/convergence";
import type { FairValueGapZone, OrderBlockZone } from "../../../lib/quant-core/zones";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const AMBER = "#d97706";
const GRID = "rgba(148,163,184,0.14)";
const INK = "#cbd5e1";
const MUTED = "#94a3b8";
const BG = "#02060f";

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const LOW_EVENTS = new Set(["PS", "SC", "ST", "Spring", "Test", "LPS", "SOW", "SOW_B", "FAIL"]);

interface Level { price: number; label: string; color: string; dash?: string; band?: [number, number]; from?: string }

export interface WyckoffSketchProps {
  bars: OhlcvBar[];
  w: WyckoffResult;
  conv: ConvergenceResultV2 | null;
  obs: OrderBlockZone[];
  fvgs: FairValueGapZone[];
  ticker: string;
}

export function wyckoffSketchWindow(bars: OhlcvBar[], w: WyckoffResult): { from: number; to: number } {
  const to = bars.length - 1;
  const start = w.phases?.[0]?.startDate ?? w.rangeStartDate;
  const idx = start ? bars.findIndex((b) => b.date >= start) : -1;
  const from = Math.max(0, Math.min(idx >= 0 ? idx - 15 : to - 120, to - 60), to - 340);
  return { from, to };
}

export default function WyckoffSketch({ bars, w, conv, obs, fvgs, ticker }: WyckoffSketchProps) {
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
    const { from, to } = wyckoffSketchWindow(bars, w);
    const view = bars.slice(from, to + 1);
    const buy = conv ? conv.side === "buy" : w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
    const levels: Level[] = [];
    if (w.rangeHigh != null) levels.push({ price: w.rangeHigh, label: `Biên trên range ${fmt(w.rangeHigh)}`, color: ACCENT, dash: "5 3" });
    if (w.rangeLow != null) levels.push({ price: w.rangeLow, label: `Biên dưới range ${fmt(w.rangeLow)}`, color: ACCENT, dash: "5 3" });
    if (conv?.zone) levels.push({ price: conv.zone.price, label: `Hợp lưu ${fmt(conv.zone.low)}–${fmt(conv.zone.high)} (${conv.zone.kinds.length} loại)`, color: AMBER, band: [conv.zone.low * 0.997, conv.zone.high * 1.003] });
    const done = (w.tranches?.tranches ?? []).filter((t) => t.status === "done" && t.date);
    const lastDone = done[done.length - 1];
    if (lastDone?.stop != null) levels.push({ price: lastDone.stop, label: `Cắt lỗ lần ${lastDone.n} ${fmt(lastDone.stop)}`, color: DOWN, dash: "2 3", from: lastDone.date! });
    const target = w.tests?.targets?.[0]?.price;
    if (target != null) levels.push({ price: target, label: `Mục tiêu ước lượng 1× ${fmt(target)}`, color: buy ? UP : DOWN, dash: "7 3" });
    // Chỉ vẽ mục tiêu khi không quá xa khung giá (tránh nén biểu đồ).
    const viewHi = Math.max(...view.map((b) => b.high)), viewLo = Math.min(...view.map((b) => b.low));
    const span = viewHi - viewLo;
    const shown = levels.filter((l) => l.price <= viewHi + 0.6 * span && l.price >= viewLo - 0.6 * span);
    const prices = [...view.flatMap((b) => [b.high, b.low]), ...shown.flatMap((l) => (l.band ? l.band : [l.price]))].filter(Number.isFinite);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    return { from, view, levels: shown, hidden: levels.filter((l) => !shown.includes(l)), lo, hi, buy, done };
  }, [bars, w, conv]);

  if (!model) return <div className="text-[10px] text-slate-500 py-6 text-center">Chưa đủ dữ liệu nến để dựng mẫu hình.</div>;
  const { view, levels, hidden, lo, hi, buy, done, from } = model;
  const W = compact ? 360 : 640, PH = compact ? 210 : 250, RIB = 18, H = PH + RIB + 4, R = compact ? 0 : 140, plotW = W - R;
  const bw = plotW / view.length;
  const x = (i: number) => i * bw + bw / 2;
  const y = (v: number) => PH - ((v - lo) / (hi - lo || 1)) * PH;
  const xOf = (d: string | null | undefined) => {
    if (!d) return null;
    const i = view.findIndex((b) => b.date >= d);
    return i >= 0 ? x(i) : null;
  };
  const xStart = (d: string | null | undefined) => (d && d < view[0].date ? 0 : xOf(d));
  const xEnd = x(view.length - 1);

  const rx0 = xStart(w.rangeStartDate), rx1 = w.rangeEndDate ? xOf(w.rangeEndDate) ?? xEnd : xEnd;
  const line = (pts: { date: string; price: number }[] | undefined) =>
    (pts ?? []).map((p) => ({ px: xOf(p.date), py: y(p.price) })).filter((p) => p.px != null).map((p) => `${p.px},${p.py}`).join(" ");
  const creek = line(w.evidence?.creek?.points);
  const ice = line(w.evidence?.ice?.points);
  const spByIndex = new Map((w.evidence?.springs ?? []).map((s) => [s.index, s.kind]));
  const events = w.events
    .filter((e) => e.date >= view[0].date)
    .map((e, k) => ({ e, k, px: xOf(e.date), low: LOW_EVENTS.has(e.event) || (e.event === "AR" && !buy) }));

  const labels = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 11) labels[i].ly = labels[i - 1].ly + 11;
  const hb = hover != null ? view[hover] : null;
  const cur = w.phases?.find((p) => p.current) ?? null;

  return (
    <div className="relative" data-testid="wyckoff-sketch" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Mô phỏng Wyckoff ${ticker}: ${buy ? "tích luỹ" : "phân phối"}${cur ? `, Phase ${cur.phase}` : ""}, từ ${view[0].date} tới ${view[view.length - 1].date}`}
        onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={plotW} y1={PH * f} y2={PH * f} stroke={GRID} />)}
        {/* range Wyckoff */}
        {rx0 != null && w.rangeHigh != null && w.rangeLow != null && (
          <rect x={rx0} width={Math.max(2, rx1 - rx0)} y={y(w.rangeHigh)} height={Math.max(2, y(w.rangeLow) - y(w.rangeHigh))}
            fill={ACCENT} opacity={0.07} stroke={ACCENT} strokeOpacity={0.6} strokeDasharray="4 3" rx={3} />
        )}
        {/* vùng hợp lưu */}
        {levels.filter((l) => l.band).map((l) => (
          <rect key={l.label} x={rx0 ?? 0} width={plotW - (rx0 ?? 0)} y={y(l.band![1])} height={Math.max(3, y(l.band![0]) - y(l.band![1]))} fill={AMBER} opacity={0.22} />
        ))}
        {/* OB / FVG cùng chiều còn hiệu lực */}
        {obs.map((z) => {
          const zx = xStart(z.date) ?? 0;
          return <rect key={`ob${z.index}`} x={zx} width={Math.max(2, xEnd - zx)} y={y(z.top)} height={Math.max(2, y(z.bottom) - y(z.top))} fill={buy ? UP : DOWN} opacity={0.12} stroke={buy ? UP : DOWN} strokeOpacity={0.5} strokeWidth={0.8} />;
        })}
        {fvgs.map((g) => {
          const zx = xStart(g.endDate) ?? 0;
          return <rect key={`fvg${g.index}`} x={zx} width={Math.max(2, xEnd - zx)} y={y(g.top)} height={Math.max(2, y(g.bottom) - y(g.top))} fill="none" stroke={buy ? UP : DOWN} strokeOpacity={0.7} strokeDasharray="2 2" strokeWidth={0.8} />;
        })}
        {/* nến */}
        {view.map((b, i) => {
          const up = b.close >= b.open, c = up ? UP : DOWN;
          const top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
          return (
            <g key={b.date}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth={1} />
              <rect x={x(i) - Math.max(0.6, bw * 0.32)} width={Math.max(1.2, bw * 0.64)} y={top} height={Math.max(1, bot - top)} fill={up ? c : BG} stroke={c} strokeWidth={up ? 0 : 1} />
            </g>
          );
        })}
        {/* Creek / ICE */}
        {creek && <polyline points={creek} fill="none" stroke={UP} strokeWidth={1.5} strokeDasharray="6 3" />}
        {ice && <polyline points={ice} fill="none" stroke={DOWN} strokeWidth={1.5} strokeDasharray="6 3" />}
        {/* đường mức giá */}
        {levels.filter((l) => !l.band).map((l) => {
          const lx = l.from ? xOf(l.from) ?? 0 : 0;
          return <line key={`l${l.label}`} x1={lx} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={1.3} strokeDasharray={l.dash} />;
        })}
        {/* sự kiện Wyckoff */}
        {events.map(({ e, k, px, low }) => {
          if (px == null) return null;
          const py = y(e.price);
          const name = spByIndex.has(e.index) ? `${e.event}#${spByIndex.get(e.index)}` : e.event;
          const pending = e.confirmedIndex == null;
          const ty = low ? Math.min(PH - 2, py + 13 + (k % 2) * 9) : Math.max(9, py - 7 - (k % 2) * 9);
          return (
            <g key={`e${e.index}-${e.event}`}>
              <circle cx={px} cy={py} r={3.5} fill={BG} stroke={low ? UP : DOWN} strokeWidth={1.8} strokeDasharray={pending ? "1.5 1.5" : undefined} />
              <text x={px} y={ty} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={INK}>{name}{pending ? "?" : ""}</text>
            </g>
          );
        })}
        {/* lần mua đã khớp */}
        {done.map((t) => {
          const px = xOf(t.date);
          if (px == null || t.price == null) return null;
          const py = y(t.price);
          return (
            <g key={`t${t.n}`}>
              <path d={`M${px},${py - 6} l5,6 l-5,6 l-5,-6 z`} fill={AMBER} stroke={BG} strokeWidth={1.2} />
              <text x={px + 7} y={py - 6} fontSize={8.5} fontWeight={700} fill={INK}>L{t.n}</text>
            </g>
          );
        })}
        {/* giá hiện tại */}
        <circle cx={xEnd} cy={y(view[view.length - 1].close)} r={3} fill={INK} />
        {/* dải Phase A–E */}
        {(w.phases ?? []).map((p, i) => {
          const a = xStart(p.startDate), b = xOf(p.endDate) ?? xEnd;
          if (a == null) return null;
          return (
            <g key={p.phase + i} data-testid={`sketch-phase-${p.phase}`}>
              <rect x={a} width={Math.max(4, b - a + bw)} y={PH + 3} height={RIB - 4} rx={2} fill={ACCENT} opacity={p.current ? 0.45 : i % 2 ? 0.16 : 0.26}
                stroke={p.current ? AMBER : "none"} strokeWidth={p.current ? 1.5 : 0} />
              <text x={a + Math.max(4, b - a + bw) / 2} y={PH + 3 + (RIB - 4) / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={p.current ? 800 : 600} fill={INK}>
                {p.phase}{p.current && b - a > 40 ? " · hiện tại" : ""}
              </text>
            </g>
          );
        })}
        {!compact && labels.map((l) => (
          <g key={`t${l.label}`}>
            <line x1={plotW + 2} x2={plotW + 12} y1={l.ly} y2={l.ly} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} />
            <text x={plotW + 15} y={l.ly + 3} fontSize={9} fill={INK}>{l.label}</text>
          </g>
        ))}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={PH} stroke={MUTED} strokeWidth={1} strokeDasharray="2 2" />}
        {view.map((b, i) => (
          <rect key={`h${b.date}`} x={i * bw} y={0} width={bw} height={PH} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hb && (
        <div className="absolute top-1 left-1 rounded-md px-2 py-1 text-[9px] font-mono text-slate-200 pointer-events-none"
          style={{ background: "rgba(2,6,15,0.92)", border: "1px solid rgba(148,163,184,0.25)" }} data-testid="wyckoff-sketch-tooltip">
          {hb.date} · O {fmt(hb.open)} H {fmt(hb.high)} L {fmt(hb.low)} C {fmt(hb.close)} · KL {fmt(hb.volume)}
        </div>
      )}
      {compact && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] mt-1" data-testid="wyckoff-sketch-levels">
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
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm border border-dashed" style={{ borderColor: ACCENT }} />Range Wyckoff</span>
        {creek && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: UP }} />Creek</span>}
        {ice && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: DOWN }} />ICE</span>}
        {conv?.zone && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: AMBER, opacity: 0.5 }} />Hợp lưu</span>}
        {(obs.length > 0 || fvgs.length > 0) && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: buy ? UP : DOWN, opacity: 0.3 }} />OB · <span className="inline-block w-3 h-2 rounded-sm border border-dashed" style={{ borderColor: buy ? UP : DOWN }} />FVG {buy ? "tăng" : "giảm"}</span>}
        {done.length > 0 && <span>◆ L1–L3: lần mua đã khớp</span>}
        <span>● sự kiện đã xác nhận · ◌? chờ xác nhận</span>
        <span className="ml-auto text-slate-500">{view[0].date} → {view[view.length - 1].date} · {from > 0 ? `${view.length} phiên` : "toàn bộ"}</span>
      </div>
      {hidden.length > 0 && <p className="text-[9px] text-slate-500 mt-0.5">Ngoài khung: {hidden.map((l) => l.label).join(" · ")}</p>}
    </div>
  );
}
