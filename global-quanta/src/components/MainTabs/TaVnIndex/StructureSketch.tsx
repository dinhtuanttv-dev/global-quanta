// Cấu trúc MTF v2 — MÔ PHỎNG TRÊN GIÁ THẬT (SVG), theo bố cục ảnh DEMO của tài liệu gốc (MA 1H/4H × Granville × Dow):
// dải giai đoạn [MỘT]/[B]/[C]/[D], vùng giữa hai MA (vàng: MA nhanh trên MA chậm, xám: dưới), MA nhanh / MA chậm (= MA 4 giờ ở khung
// 1 giờ) / MA ngày, sóng trung (Dow), mốc sóng lớn ("mức 4 giờ"), viền cổ + điểm phá, Granville 1–4 và điểm vào cốt lõi L / S,
// hộp R:R "nếu mua ở giá hiện tại", khối lượng. Mọi lớp ghim theo NẾN của biểu đồ đang xem (x = chỉ số nến; ngày không khớp thì bỏ).
import { useMemo } from "react";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";
import type { StructureStage, StructureTf } from "../../../hooks/useStructure";
import { chartDateOf, fmtPrice } from "../../../lib/ta-command-center/chart/structureScene";

const W = 760, H = 330, PL = 6, PR = 64, PT = 22, VOL = 38, GAP = 6, AX = 12;
const VIEW: Partial<Record<Timeframe, number>> = { D: 170, W: 130, "1H": 220 };
export const SK = {
  fast: "#3b82f6", slow: "#ef4444", ctx: "#10b981", bull: "#10b981", bear: "#f43f5e", ls: "#ec4899", amber: "#f59e0b",
  zoneUp: "rgba(250,204,21,0.16)", zoneDn: "rgba(148,163,184,0.13)",
} as const;
/** Màu dải giai đoạn như ảnh DEMO: xanh = tích lũy / tái tích lũy / tăng, đỏ = phân phối / đảo chiều / giảm. */
export const STAGE_BAND: Record<StructureStage, { fill: string; chip: string | null; text: string }> = {
  A: { fill: "rgba(16,185,129,0.13)", chip: "#16a34a", text: "MỘT" }, B: { fill: "rgba(16,185,129,0.13)", chip: "#16a34a", text: "B" },
  UP: { fill: "rgba(16,185,129,0.05)", chip: null, text: "Tăng" }, C: { fill: "rgba(244,63,94,0.12)", chip: "#dc2626", text: "C" },
  D: { fill: "rgba(244,63,94,0.12)", chip: "#dc2626", text: "D" }, DOWN: { fill: "rgba(244,63,94,0.05)", chip: null, text: "Giảm" },
  Bp: { fill: "rgba(245,158,11,0.09)", chip: "#d97706", text: "B′" }, RANGE: { fill: "rgba(148,163,184,0.07)", chip: null, text: "Củng cố" },
};
const GRAN: Record<string, string> = { M1: "1", M2: "2", M3: "3", M4: "4", B1: "1", B2: "2", B3: "3", B4: "4", G3: "G3", L: "L", S: "S" };

function sma(v: number[], n: number): number[] {
  const out = new Array<number>(v.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}

interface Props { bars: OhlcvBar[]; tf: StructureTf; timeframe: Timeframe }

export default function StructureSketch({ bars, tf, timeframe }: Props) {
  const g = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const mF = sma(closes, tf.ma.fast), mS = sma(closes, tf.ma.slow), mC = tf.ma.ctx ? sma(closes, tf.ma.ctx) : null;
    // Ưu tiên chuỗi MA do Gateway tính trên lịch sử đầy đủ (biểu đồ 1 giờ chỉ tải vài chục phiên < MA80 / MA100 tiết).
    const ms = tf.maSeries;
    if (ms) {
      const pos = new Map(ms.dates.map((d, i) => [chartDateOf(timeframe, d), i]));
      bars.forEach((b, i) => {
        const j = pos.get(b.date);
        if (j == null) return;
        if (ms.fast?.[j] != null) mF[i] = ms.fast[j]!;
        if (ms.slow?.[j] != null) mS[i] = ms.slow[j]!;
        if (mC && ms.ctx?.[j] != null) mC[i] = ms.ctx[j]!;
      });
    }
    const a = Math.max(0, bars.length - (VIEW[timeframe] ?? 170));
    const view = bars.slice(a), n = view.length;
    const idx = new Map(view.map((b, i) => [b.date, i]));
    const at = (d: string | null | undefined) => (d ? idx.get(chartDateOf(timeframe, d)) ?? null : null);
    let lo = Infinity, hi = -Infinity;
    for (const b of view) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); }
    const last = view[n - 1]?.close ?? 0;
    const near = (v: number | null | undefined) => v != null && Number.isFinite(v) && Math.abs(Math.log(v / last)) <= 0.25;
    const rr = tf.rrNow;
    if (rr && near(rr.stop)) lo = Math.min(lo, rr.stop);
    if (rr && near(rr.target)) hi = Math.max(hi, rr.target);
    const span = hi - lo || 1; lo -= span * 0.06; hi += span * 0.06;
    const plotH = H - PT - VOL - GAP - AX, step = (W - PL - PR) / Math.max(1, n);
    const x = (i: number) => PL + step * (i + 0.5), y = (v: number) => PT + ((hi - v) / (hi - lo)) * plotH;
    const vMax = Math.max(1, ...view.map((b) => b.volume ?? 0));
    const sl = (arr: number[] | null) => (arr ? arr.slice(a) : null);
    return { view, n, at, lo, hi, plotH, step, x, y, vMax, volTop: PT + plotH + GAP, mF: sl(mF)!, mS: sl(mS)!, mC: sl(mC) };
  }, [bars, tf, timeframe]);

  if (!bars.length) return <div className="text-[10px] text-slate-500 py-10 text-center">Chưa có nến.</div>;
  const { view, n, at, lo, hi, plotH, step, x, y, vMax, volTop, mF, mS, mC } = g;
  const inView = (v: number) => v >= lo && v <= hi;
  const bw = Math.max(1, Math.min(8, step * 0.66));
  const xEnd = W - PR;
  const path = (arr: number[]) => arr.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(" ");

  // Vùng giữa hai MA, tách theo dấu (vàng / xám) — mỗi đoạn liền mạch là một đa giác.
  const fills: { d: string; up: boolean }[] = [];
  let run: number[] = [], runUp = true;
  const flush = () => {
    if (run.length > 1) {
      const top = run.map((i) => `${x(i).toFixed(1)},${y(mF[i]).toFixed(1)}`), bot = [...run].reverse().map((i) => `${x(i).toFixed(1)},${y(mS[i]).toFixed(1)}`);
      fills.push({ d: `M ${top.join(" L ")} L ${bot.join(" L ")} Z`, up: runUp });
    }
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(mF[i]) || !Number.isFinite(mS[i])) { flush(); continue; }
    const up = mF[i] >= mS[i];
    if (run.length && up !== runUp) { run.push(i); flush(); }
    if (!run.length) runUp = up;
    run.push(i);
  }
  flush();

  // Dải giai đoạn (đoạn bắt đầu trước khung nhìn được neo vào nến đầu).
  const bands = tf.segments.map((s) => {
    const i0 = at(s.from) ?? (chartDateOf(timeframe, s.from) < view[0].date ? 0 : null);
    const i1 = at(s.to) ?? (chartDateOf(timeframe, s.to) >= view[n - 1].date ? n - 1 : null);
    return i0 == null || i1 == null || i1 < i0 ? null : { s, i0, i1 };
  }).filter((b): b is { s: (typeof tf.segments)[number]; i0: number; i1: number } => b !== null);

  const swings = tf.swings.map((s) => ({ ...s, i: at(s.date) })).filter((s): s is typeof s & { i: number } => s.i != null);
  const large = (tf.swingsLarge ?? []).map((s) => ({ ...s, i: at(s.date) })).filter((s): s is typeof s & { i: number } => s.i != null);
  const lvl = timeframe === "1H" ? "mức 4 giờ" : timeframe === "W" ? "mức tháng" : "mức tuần";
  const lastClose = view[n - 1].close;
  const rr = tf.rrNow;
  const labelEvery = Math.max(1, Math.round(n / 7));
  const axisLabel = (d: string) => (timeframe === "1H" ? `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 13)}h` : timeframe === "W" ? d.slice(2, 7) : `${d.slice(8, 10)}/${d.slice(5, 7)}`);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" data-testid="structure-sketch"
        aria-label={`Mô phỏng cấu trúc ${tf.stageLabel} trên giá thật, ${n} nến`}>
        {bands.map(({ s, i0, i1 }, k) => {
          const st = STAGE_BAND[s.stage], x0 = x(i0) - step / 2, wd = Math.max(1, x(i1) - x(i0) + step);
          const labelled = st.chip && wd >= 18;
          return (
            <g key={`${s.from}-${k}`} data-testid="structure-sketch-band" data-stage={s.stage}>
              <rect x={x0} y={PT} width={wd} height={plotH} fill={st.fill}><title>{`${s.label}: ${s.from} → ${s.to}`}</title></rect>
              {labelled && <>
                <rect x={x0 + wd / 2 - 14} y={3} width={28} height={14} rx={3} fill={st.chip!} />
                <text x={x0 + wd / 2} y={13.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">{st.text}</text>
              </>}
            </g>
          );
        })}
        {[0.12, 0.38, 0.64, 0.9].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={PL} x2={xEnd} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.08)" /><text x={xEnd + 4} y={y(v) + 3} fontSize={8} fill="#64748b">{fmtPrice(v)}</text></g>; })}
        {fills.map((f, k) => <path key={k} d={f.d} fill={f.up ? SK.zoneUp : SK.zoneDn} data-testid="structure-sketch-zone" />)}
        {view.map((b, i) => {
          const up = b.close >= b.open, c = up ? "#10b981" : "#f43f5e", cx = x(i);
          return (
            <g key={b.date}>
              <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth={0.7} />
              <rect x={cx - bw / 2} y={Math.min(y(b.open), y(b.close))} width={bw} height={Math.max(0.8, Math.abs(y(b.open) - y(b.close)))} fill={up ? "rgba(16,185,129,0.75)" : "rgba(244,63,94,0.75)"} />
              <rect x={cx - bw / 2} y={volTop + VOL - ((b.volume ?? 0) / vMax) * VOL} width={bw} height={((b.volume ?? 0) / vMax) * VOL} fill="rgba(59,130,246,0.45)" />
            </g>
          );
        })}
        {mC && <polyline points={path(mC)} fill="none" stroke={SK.ctx} strokeWidth={1} strokeDasharray="3 3" data-testid="structure-sketch-ma-ctx" />}
        <polyline points={path(mS)} fill="none" stroke={SK.slow} strokeWidth={1.8} data-testid="structure-sketch-ma-slow" />
        <polyline points={path(mF)} fill="none" stroke={SK.fast} strokeWidth={1.3} data-testid="structure-sketch-ma-fast" />
        {swings.length >= 2 && <polyline points={swings.map((s) => `${x(s.i).toFixed(1)},${y(s.price).toFixed(1)}`).join(" ")} fill="none" stroke="rgba(148,163,184,0.7)" strokeWidth={1} data-testid="structure-sketch-swings" />}
        {large.map((s) => (
          <g key={`L${s.date}`} data-testid="structure-sketch-large">
            <line x1={x(s.i) - 10} x2={x(s.i) + 10} y1={y(s.price)} y2={y(s.price)} stroke={s.kind === "H" ? SK.bear : SK.fast} strokeWidth={2} />
            <title>{`${s.kind === "H" ? "Đỉnh" : "Đáy"} ${lvl} ${fmtPrice(s.price)}`}</title>
          </g>
        ))}
        {tf.patterns.filter((p) => p.status !== "failed").map((p) => {
          const col = p.dir === 1 ? SK.bull : SK.bear;
          const i0 = at(p.neck.d0), iB = p.breakDate ? at(p.breakDate) : null, iEnd = iB ?? n - 1;
          if (i0 == null) return null;
          const yN = y(p.neck.p1);
          return (
            <g key={`${p.type}${p.confirmedDate}`} data-testid="structure-sketch-pattern">
              <line x1={x(i0)} x2={x(iEnd)} y1={y(p.neck.p0)} y2={yN} stroke={col} strokeWidth={1.3} strokeDasharray="5 3" />
              <text x={x(i0)} y={y(p.neck.p0) - 4} fontSize={8} fill={col}>Viền cổ · {p.name}{p.contextLabel ? ` · ${p.contextLabel}` : ""}</text>
              {p.points.filter((q) => q.label !== "Cổ").map((q) => { const qi = at(q.date); return qi == null ? null : <text key={q.date} x={x(qi)} y={y(q.price) + (p.dir === 1 ? 11 : -5)} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={col}>{q.label}</text>; })}
              {iB != null && <circle cx={x(iB)} cy={yN} r={4.5} fill="none" stroke={col} strokeWidth={1.6} data-testid="structure-sketch-break"><title>{`Phá viền cổ ${p.breakDate}`}</title></circle>}
            </g>
          );
        })}
        {tf.signals.map((s) => {
          const i = at(s.date); if (i == null) return null;
          const b = view[i], buy = s.side === "MUA", core = s.code === "L" || s.code === "S";
          const col = core ? SK.ls : s.code === "G3" ? SK.amber : buy ? SK.bull : SK.bear;
          const yy = buy ? y(b.low) + 6 : y(b.high) - 6, dirY = buy ? 1 : -1;
          return (
            <g key={`${s.date}${s.code}`} data-testid={core ? "structure-sketch-core" : "structure-sketch-granville"}>
              <path d={`M ${x(i)} ${yy} l -${core ? 4 : 3} ${dirY * (core ? 8 : 6)} h ${core ? 8 : 6} z`} fill={col} />
              <text x={x(i)} y={yy + dirY * (core ? 18 : 14)} textAnchor="middle" fontSize={core ? 9 : 7.5} fontWeight={800} fill={col}>{GRAN[s.code] ?? s.code}</text>
              <title>{`${s.date}: ${s.note}`}</title>
            </g>
          );
        })}
        {rr && (
          <g data-testid="structure-sketch-rr">
            {inView(rr.target) && <><line x1={x(n - 1)} x2={xEnd} y1={y(rr.target)} y2={y(rr.target)} stroke={SK.bull} strokeDasharray="4 3" />
              <text x={xEnd - 2} y={y(rr.target) - 3} textAnchor="end" fontSize={7.5} fill="#6ee7b7">Mục tiêu {fmtPrice(rr.target)}{rr.targetBasis === "3R" ? " (3R)" : ` (đỉnh ${lvl})`}</text></>}
            {inView(rr.stop) && <><line x1={x(n - 1)} x2={xEnd} y1={y(rr.stop)} y2={y(rr.stop)} stroke={SK.bear} strokeDasharray="2 2" />
              <text x={xEnd - 2} y={y(rr.stop) + 9} textAnchor="end" fontSize={7.5} fill="#fda4af">Cắt lỗ {fmtPrice(rr.stop)}</text></>}
          </g>
        )}
        <line x1={PL} x2={xEnd} y1={y(lastClose)} y2={y(lastClose)} stroke="rgba(251,191,36,0.4)" strokeDasharray="2 3" />
        <rect x={xEnd + 1} y={y(lastClose) - 6} width={PR - 2} height={12} rx={2} fill={SK.amber} />
        <text x={xEnd + 4} y={y(lastClose) + 3} fontSize={8} fontWeight={700} fill="#0f172a">{fmtPrice(lastClose)}</text>
        {view.map((b, i) => (i % labelEvery === 0 ? <text key={`t${b.date}`} x={x(i)} y={H - 2} textAnchor="middle" fontSize={7.5} fill="#64748b">{axisLabel(b.date)}</text> : null))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8.5px] text-slate-400 mt-1" data-testid="structure-sketch-legend">
        <span><i className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: SK.fast }} />MA {tf.ma.fast}{timeframe === "1H" ? " tiết (1 giờ)" : ""}</span>
        <span><i className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: SK.slow }} />MA {tf.ma.slow}{timeframe === "1H" ? " tiết (= MA 4 giờ)" : timeframe === "D" ? " (= MA20 tuần)" : ""}</span>
        {tf.ma.ctx && <span><i className="inline-block w-3 h-0.5 align-middle mr-1 border-t border-dashed" style={{ borderColor: SK.ctx }} />MA {tf.ma.ctx} tiết (= MA ngày)</span>}
        <span><i className="inline-block w-2.5 h-2 align-middle mr-1 rounded-sm" style={{ background: "rgba(16,185,129,0.35)" }} />Tích lũy / Tái tích lũy / Tăng</span>
        <span><i className="inline-block w-2.5 h-2 align-middle mr-1 rounded-sm" style={{ background: "rgba(244,63,94,0.35)" }} />Phân phối / Đảo chiều / Giảm</span>
        <span><i className="inline-block w-2.5 h-2 align-middle mr-1 rounded-sm" style={{ background: SK.zoneUp }} />MA nhanh trên MA chậm</span>
        <span><b style={{ color: SK.bull }}>▲1–4</b> / <b style={{ color: SK.bear }}>▼1–4</b> Granville</span>
        <span><b style={{ color: SK.ls }}>L / S</b> khung nhỏ thuận chiều MA chậm</span>
        <span><i className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: SK.bear }} />đỉnh / <i className="inline-block w-3 h-0.5 align-middle mx-1" style={{ background: SK.fast }} />đáy {lvl}</span>
      </div>
    </div>
  );
}
