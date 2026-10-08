// "Mẫu hình mô phỏng" (Screener Engine v2 / S5): nến thật + hình học của bộ lọc, ghim theo NGÀY vào nến.
//   CAN SLIM: đường cốc (U lý tưởng qua miệng trái → đáy → miệng phải), vùng tay cầm, cụm hợp lưu Fib/Elliott,
//             đếm 0-1-2-3 cạnh phải + A-B tay cầm, pivot, vùng mua, cắt lỗ, mục tiêu, điểm mua sớm.
//   Base Breakout: hộp nền 10 phiên, pivot, POC/VAH, cắt lỗ, mục tiêu.
// Màu (đã kiểm định trên nền tối): tăng #059669 / giảm #e11d48 (nến tăng ĐẶC, giảm RỖNG — mã hoá phụ cho người mù màu),
// nhấn #0284c7, hợp lưu #d97706. Mọi đường mức giá có NHÃN CHỮ trực tiếp, chữ dùng màu chữ (không dùng màu đường).
import { useEffect, useMemo, useRef, useState } from "react";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import type { TechnicalFilterResult, TechnicalFilterStrategy } from "../../../hooks/useTechnicalFilter";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const AMBER = "#d97706";
const GRID = "rgba(148,163,184,0.14)";
const INK = "#cbd5e1";
const MUTED = "#94a3b8";

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

interface Level { price: number; label: string; color: string; dash?: string; band?: [number, number] }

export function sketchWindow(bars: OhlcvBar[], result: TechnicalFilterResult): { from: number; to: number } {
  const start = result.pattern?.leftLipDate ?? result.base?.fromDate ?? null;
  const idx = start ? bars.findIndex((b) => b.date >= start) : -1;
  const to = bars.length - 1;
  const from = Math.max(0, Math.min(idx >= 0 ? idx - 15 : to - 90, to - 40), to - 340);
  return { from, to };
}

export default function PatternSketch({ bars, result, strategy }: { bars: OhlcvBar[]; result: TechnicalFilterResult; strategy: TechnicalFilterStrategy }) {
  const [hover, setHover] = useState<number | null>(null);
  // Màn hình hẹp (< 480px): bỏ cột nhãn bên phải (chữ sẽ quá nhỏ), liệt kê mức giá dưới biểu đồ.
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
    const { from, to } = sketchWindow(bars, result);
    const view = bars.slice(from, to + 1);
    const p = result.pattern, h = result.handle, plan = result.plan ?? result.metrics.plan;
    const levels: Level[] = [];
    const pivot = result.metrics.pivot ?? result.metrics.basePivot;
    if (pivot) levels.push({ price: pivot, label: `Pivot ${fmt(pivot)}`, color: INK, dash: "5 3" });
    if (plan?.stop) levels.push({ price: plan.stop, label: `Cắt lỗ ${fmt(plan.stop)}`, color: DOWN, dash: "2 3" });
    if (plan?.target) levels.push({ price: plan.target, label: `Mục tiêu ${fmt(plan.target)}`, color: UP, dash: "7 3" });
    if (strategy === "camslim" && pivot) {
      const top = result.plan?.buyZoneTop ?? pivot * 1.05;
      levels.push({ price: top, label: "Vùng mua (pivot → +5%)", color: UP, band: [pivot, top] });
    }
    if (h?.best) levels.push({ price: h.best.price, label: `Hợp lưu ${fmt(h.best.low)}–${fmt(h.best.high)}`, color: AMBER, band: [h.best.low, h.best.high] });
    if (strategy === "base-breakout" && result.metrics.vp) {
      levels.push({ price: result.metrics.vp.poc, label: `POC ${fmt(result.metrics.vp.poc)}`, color: ACCENT, dash: "1 3" });
      levels.push({ price: result.metrics.vp.vah, label: `VAH ${fmt(result.metrics.vp.vah)}`, color: ACCENT, dash: "1 3" });
    }
    const prices = [...view.flatMap((b) => [b.high, b.low]), ...levels.flatMap((l) => (l.band ? l.band : [l.price]))].filter(Number.isFinite);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    const padP = (hi - lo) * 0.06; lo -= padP; hi += padP;
    return { from, view, levels, lo, hi, p, h };
  }, [bars, result, strategy]);

  if (!model) return <div className="text-[10px] text-slate-500 py-6 text-center">Chưa đủ dữ liệu nến để dựng mẫu hình.</div>;
  const { view, levels, lo, hi, p, h, from } = model;
  const W = compact ? 360 : 640, H = compact ? 230 : 260, R = compact ? 0 : 132, plotW = W - R; // khoảng phải dành cho nhãn mức giá
  const bw = plotW / view.length;
  const x = (i: number) => i * bw + bw / 2;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const xOfDate = (d: string | undefined) => {
    if (!d) return null;
    const i = view.findIndex((b) => b.date >= d);
    return i >= 0 ? x(i) : null;
  };

  // Đường cốc lý tưởng (U) qua 3 điểm của mẫu hình.
  let cupPath: string | null = null;
  if (p) {
    const xL = xOfDate(p.leftLipDate), xB = xOfDate(p.cupLowDate), xR = xOfDate(p.rightLipDate);
    if (xL != null && xB != null && xR != null) {
      const yL = y(p.leftLip), yB = y(p.cupLow), yR = y(p.rightLip);
      cupPath = `M${xL},${yL} C${xL + (xB - xL) * 0.18},${yB} ${xB - (xB - xL) * 0.4},${yB} ${xB},${yB} C${xB + (xR - xB) * 0.4},${yB} ${xR - (xR - xB) * 0.18},${yB} ${xR},${yR}`;
    }
  }
  const xR = p ? xOfDate(p.rightLipDate) : null;
  const xEnd = x(view.length - 1);
  const baseX0 = result.base ? xOfDate(result.base.fromDate) : null, baseX1 = result.base ? xOfDate(result.base.toDate) : null;

  // Nhãn mức giá bên phải: giãn để không chồng lên nhau.
  const labels = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 11) labels[i].ly = labels[i - 1].ly + 11;

  const hb = hover != null ? view[hover] : null;
  const wavePts = h?.wave?.points ?? [];
  return (
    <div className="relative" data-testid="pattern-sketch" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Mẫu hình mô phỏng ${result.ticker}: ${strategy === "camslim" ? "cốc tay cầm" : "nền giá"} từ ${view[0].date} tới ${view[view.length - 1].date}`}
        onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={plotW} y1={H * f} y2={H * f} stroke={GRID} />)}
        {/* dải: vùng mua / hợp lưu */}
        {levels.filter((l) => l.band).map((l) => (
          <rect key={l.label} x={l.color === AMBER && xR != null ? xR : 0} width={plotW - (l.color === AMBER && xR != null ? xR : 0)}
            y={y(l.band![1])} height={Math.max(2, y(l.band![0]) - y(l.band![1]))} fill={l.color} opacity={l.color === AMBER ? 0.22 : 0.1} />
        ))}
        {/* tay cầm */}
        {p && xR != null && (
          <rect x={xR} width={Math.max(2, xEnd - xR)} y={y(p.rightLip)} height={Math.max(2, y(p.handleLow) - y(p.rightLip))}
            fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="3 2" rx={3} />
        )}
        {/* hộp nền (Base Breakout) */}
        {result.base && baseX0 != null && baseX1 != null && (
          <rect x={baseX0 - bw / 2} width={Math.max(2, baseX1 - baseX0 + bw)} y={y(result.base.high)} height={Math.max(2, y(result.base.low) - y(result.base.high))}
            fill={ACCENT} opacity={0.12} stroke={ACCENT} strokeWidth={1} rx={3} />
        )}
        {/* nến */}
        {view.map((b, i) => {
          const up = b.close >= b.open, c = up ? UP : DOWN;
          const top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
          return (
            <g key={b.date}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth={1} />
              <rect x={x(i) - Math.max(0.6, bw * 0.32)} width={Math.max(1.2, bw * 0.64)} y={top} height={Math.max(1, bot - top)}
                fill={up ? c : "#02060f"} stroke={c} strokeWidth={up ? 0 : 1} />
            </g>
          );
        })}
        {cupPath && <path d={cupPath} fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" opacity={0.95} />}
        {/* đếm sóng cạnh phải + A-B tay cầm */}
        {wavePts.map((pt, k) => {
          const px = xOfDate(pt.date);
          return px == null ? null : (
            <g key={`w${k}`}>
              <circle cx={px} cy={y(pt.price)} r={4} fill="#02060f" stroke={AMBER} strokeWidth={2} />
              <text x={px} y={Math.max(10, Math.min(H - 2, y(pt.price) + (k % 2 === 0 ? 14 : -8)))} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK}>{k}</text>
            </g>
          );
        })}
        {h?.abc && [["A", h.abc.A], ["B", h.abc.B]].map(([name, pt]) => {
          const q = pt as { date: string; price: number };
          const px = xOfDate(q.date);
          return px == null ? null : (
            <g key={name as string}>
              <circle cx={px} cy={y(q.price)} r={3.5} fill="#02060f" stroke={ACCENT} strokeWidth={2} />
              <text x={px} y={Math.max(10, Math.min(H - 2, y(q.price) + (name === "A" ? 13 : -7)))} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK}>{name as string}</text>
            </g>
          );
        })}
        {h?.earlyEntry && (
          <g>
            <path d={`M${xEnd},${y(h.earlyEntry.price) - 5} l5,5 l-5,5 l-5,-5 z`} fill={AMBER} stroke="#02060f" strokeWidth={1.5} />
          </g>
        )}
        {/* đường mức giá + nhãn bên phải */}
        {levels.filter((l) => !l.band || l.color === AMBER).map((l) => (
          <line key={`l${l.label}`} x1={l.color === AMBER && xR != null ? xR : 0} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={l.color === AMBER ? 1 : 1.5} strokeDasharray={l.dash} />
        ))}
        {!compact && labels.map((l) => (
          <g key={`t${l.label}`}>
            <line x1={plotW + 2} x2={plotW + 12} y1={l.ly} y2={l.ly} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} />
            <text x={plotW + 15} y={l.ly + 3} fontSize={9} fill={INK}>{l.label}</text>
          </g>
        ))}
        {/* lớp hover */}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H} stroke={MUTED} strokeWidth={1} strokeDasharray="2 2" />}
        {view.map((b, i) => (
          <rect key={`h${b.date}`} x={i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hb && (
        <div className="absolute top-1 left-1 rounded-md px-2 py-1 text-[9px] font-mono text-slate-200 pointer-events-none"
          style={{ background: "rgba(2,6,15,0.92)", border: "1px solid rgba(148,163,184,0.25)" }} data-testid="sketch-tooltip">
          {hb.date} · O {fmt(hb.open)} H {fmt(hb.high)} L {fmt(hb.low)} C {fmt(hb.close)} · KL {fmt(hb.volume)}
        </div>
      )}
      {compact && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] mt-1" data-testid="sketch-levels">
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
        {cupPath && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: ACCENT }} />Đường cốc</span>}
        {p && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm border border-dashed" style={{ borderColor: ACCENT }} />Tay cầm</span>}
        {result.base && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: ACCENT, opacity: 0.4 }} />Nền giá</span>}
        {h?.best && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: AMBER, opacity: 0.5 }} />Hợp lưu Fib/Elliott · ◆ mua sớm</span>}
        {wavePts.length > 0 && <span>0-1-2-3: sóng cạnh phải · A-B: tay cầm</span>}
        <span className="ml-auto text-slate-500">{view[0].date} → {view[view.length - 1].date} · {from > 0 ? `${view.length} phiên` : "toàn bộ"}</span>
      </div>
    </div>
  );
}
