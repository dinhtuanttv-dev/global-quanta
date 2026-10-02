import { useState } from "react";
import type { SieuQuetIndexState } from "../../../hooks/useSieuQuetScanner";
import type { MarketIntel, PerformanceRow } from "../../../hooks/useResearch";

// Market Intelligence cấp VN-Index: các khối hiển thị dùng chung cho dải VN-Index.
// Nguyên tắc: màu luôn kèm chữ/ký hiệu; mọi xác suất kèm khoảng tin cậy; tín hiệu chưa qua kiểm định ghi rõ "chỉ tham khảo".

export const UP = "#10b981", DOWN = "#f43f5e", AMBER = "#f59e0b", VIOLET = "#a78bfa", MUTED = "#64748b";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const pct = (v: number | null | undefined, d = 0) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : "—");
const fx = (v: number | null | undefined, d = 1) => (isNum(v) ? v.toFixed(d) : "—");
const signed = (v: number | null | undefined, d = 2) => (isNum(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}` : "—");

export function riskLevel(risk: number | null | undefined) {
  if (!isNum(risk)) return { label: "—", color: MUTED };
  return risk > 60 ? { label: "Cao", color: DOWN } : risk >= 35 ? { label: "Vừa", color: AMBER } : { label: "Thấp", color: UP };
}

/** Thanh xác suất chế độ HMM: ▼ Giảm · ■ Đi ngang · ▲ Tăng. */
export function HmmBar({ c, compact = false }: { c: { pBear: number | null; pNeutral: number | null; pBull: number | null }; compact?: boolean }) {
  if (!isNum(c.pBull) || !isNum(c.pBear) || !isNum(c.pNeutral)) return null;
  const seg = [
    { v: c.pBear, color: DOWN, label: "▼ Giảm" },
    { v: c.pNeutral, color: AMBER, label: "■ Đi ngang" },
    { v: c.pBull, color: UP, label: "▲ Tăng" },
  ];
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? "" : "w-full"}`} title={seg.map((s) => `${s.label} ${pct(s.v)}`).join(" · ")}
      role="img" aria-label={`Xác suất chế độ HMM: ${seg.map((s) => `${s.label} ${pct(s.v)}`).join(", ")}`}>
      {compact && <span className="text-slate-500">HMM</span>}
      <span className={`flex h-2 rounded-full overflow-hidden ${compact ? "w-24" : "flex-1"}`}>
        {seg.map((s) => <span key={s.label} style={{ width: `${s.v * 100}%`, background: s.color }} />)}
      </span>
      {compact && (() => { const top = seg.reduce((a, b) => (b.v > a.v ? b : a)); return <b className="font-mono" style={{ color: top.color }}>{top.label} {pct(top.v)}</b>; })()}
    </span>
  );
}

/** Thanh mức 0–100 có vạch ngưỡng. */
function Meter({ value, min = 0, max = 100, marks = [], color }: { value: number | null | undefined; min?: number; max?: number; marks?: number[]; color: string }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="relative h-1.5 rounded-full bg-white/10 mt-1">
      {isNum(value) && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(value), background: color }} />}
      {marks.map((m) => <div key={m} className="absolute -top-0.5 h-2.5 w-px bg-slate-400/60" style={{ left: pos(m) }} />)}
    </div>
  );
}

function Tile({ label, value, color, children, title }: { label: string; value: React.ReactNode; color?: string; children?: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5 bg-white/[0.03] border border-white/5" title={title}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9.5px] text-slate-500">{label}</span>
        <b className="font-mono text-[11px]" style={{ color: color ?? "#e2e8f0" }}>{value}</b>
      </div>
      {children}
    </div>
  );
}

const BIAS_COLOR: Record<string, string> = { uptrend: UP, accumulation: AMBER, defensive: "#60a5fa", distribution: DOWN, downtrend: DOWN };

/** Phân tích kỹ thuật đa tầng — giữ đủ chỉ số cũ, trình bày thành ô có thanh so ngưỡng. */
export function TechnicalTiles({ state, close }: { state: SieuQuetIndexState | null; close: number | null }) {
  if (!state) return <div className="text-[10px] text-slate-500">Đang tải dữ liệu VN-Index...</div>;
  const vs = (ma: number) => (close && ma ? (close / ma - 1) * 100 : null);
  const maTile = (label: string, ma: number) => {
    const d = vs(ma);
    return (
      <Tile key={label} label={label} value={fx(ma)} title={d === null ? undefined : `VN-Index ${d >= 0 ? "trên" : "dưới"} ${label} ${Math.abs(d).toFixed(1)}%`}>
        {d !== null && <div className="text-[9px] font-mono" style={{ color: d >= 0 ? UP : DOWN }}>{d >= 0 ? "▲ trên" : "▼ dưới"} {Math.abs(d).toFixed(1)}%</div>}
      </Tile>
    );
  };
  const rsiColor = state.rsi14 >= 70 ? DOWN : state.rsi14 <= 30 ? UP : "#e2e8f0";
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex justify-between items-baseline">
        <span className="text-slate-500 text-[10.5px]">Xu hướng</span>
        <span className="font-semibold text-[11.5px]" style={{ color: BIAS_COLOR[state.trendBias] ?? "#e2e8f0" }}>{state.trendLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">{[maTile("MA20", state.ma20), maTile("MA50", state.ma50), maTile("MA200", state.ma200)]}</div>
      <div className="grid grid-cols-2 gap-1">
        <Tile label="RSI(14)" value={fx(state.rsi14)} color={rsiColor} title="Vạch 30 / 70: quá bán / quá mua">
          <Meter value={state.rsi14} marks={[30, 70]} color={rsiColor === "#e2e8f0" ? "#94a3b8" : rsiColor} />
        </Tile>
        <Tile label="MACD Hist." value={fx(state.macdHistogram, 2)} color={state.macdHistogram >= 0 ? UP : DOWN}>
          <div className="text-[9px]" style={{ color: state.macdHistogram >= 0 ? UP : DOWN }}>{state.macdHistogram >= 0 ? "▲ động lượng dương" : "▼ động lượng âm"}</div>
        </Tile>
        <Tile label="Breadth" value={`${fx(state.marketBreadthPct)}%`} color={state.marketBreadthPct >= 50 ? UP : DOWN} title="% mã trên MA20 · vạch 50%">
          <Meter value={state.marketBreadthPct} marks={[50]} color={state.marketBreadthPct >= 50 ? UP : DOWN} />
        </Tile>
        <Tile label="Phân kỳ" value={state.divergence} />
        <Tile label="ATR Percentile" value={fx(state.atrPercentile)} title="Biến động hiện tại so lịch sử (cao = biến động mạnh)">
          <Meter value={state.atrPercentile} marks={[50, 80]} color={state.atrPercentile >= 80 ? AMBER : "#94a3b8"} />
        </Tile>
        <Tile label="Breakout Prob." value={`${fx(state.breakoutProbability)}%`}>
          <Meter value={state.breakoutProbability} marks={[50]} color={state.breakoutProbability >= 50 ? UP : "#94a3b8"} />
        </Tile>
      </div>
      <p className="text-slate-400 text-[10px] pt-1.5 border-t border-white/10 leading-snug">{state.narrative}</p>
    </div>
  );
}

/** Cột z (âm đỏ / dương xanh) quanh 0. */
function ZSpark({ values, label }: { values: (number | null)[]; label: string }) {
  const W = 120, H = 26, n = values.length, bw = W / Math.max(1, n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-7 block" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.3)" />
      {values.map((v, i) => {
        if (!isNum(v)) return null;
        const h = Math.min(H / 2, (Math.abs(v) / 2.5) * (H / 2));
        return <rect key={i} x={i * bw + 0.15} width={Math.max(0.4, bw - 0.3)} y={v >= 0 ? H / 2 - h : H / 2} height={h} fill={v >= 0 ? UP : DOWN} opacity={i === n - 1 ? 1 : 0.55} />;
      })}
    </svg>
  );
}

/** Market Impulse (giữ đồng hồ cũ) + Impulse 2.0 + dấu chân tay to + khối ngoại + ngày phân phối + VSA + rủi ro phân phối. */
export function ImpulseFlowPanel({ score, intel }: { score: number | null; intel: MarketIntel | null | undefined }) {
  const zoneColor = !isNum(score) ? MUTED : score < 35 ? DOWN : score <= 65 ? AMBER : UP;
  const zoneLabel = !isNum(score) ? "" : score < 35 ? "Rủi ro cao" : score <= 65 ? "Tích lũy an toàn" : "Hưng phấn / Mở rộng";
  const c = intel?.current;
  const series = intel?.series.slice(-60) ?? [];
  const last25 = intel?.series.slice(-25) ?? [];
  const risk = riskLevel(c?.risk);
  const i2 = c?.impulse2;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="text-3xl font-mono font-semibold" style={{ color: zoneColor }}>{fx(score)}</div>
        <div className="flex-1">
          <Meter value={score} marks={[35, 65]} color={zoneColor} />
          <div className="text-[10px] mt-1" style={{ color: zoneColor }}>{zoneLabel}</div>
        </div>
      </div>
      {!c ? <div className="text-[10px] text-slate-500">Lớp dòng tiền lớn sẽ hiện sau lần chạy job nghiên cứu kế tiếp.</div> : (
        <>
          <Tile label="Impulse 2.0 (lọc dòng tiền lớn)" value={fx(i2)} color={!isNum(i2) ? MUTED : i2 < 35 ? DOWN : i2 <= 65 ? AMBER : UP}
            title="75% Impulse cũ + 25% điểm dấu chân tay to (z 5 phiên). Đang được chấm điểm trong vòng phản hồi.">
            <Meter value={i2} marks={[35, 65]} color={!isNum(i2) ? MUTED : i2 < 35 ? DOWN : i2 <= 65 ? AMBER : UP} />
          </Tile>
          <div className="rounded-lg px-2 py-1.5 bg-white/[0.03] border border-white/5">
            <div className="flex items-baseline justify-between text-[9.5px]">
              <span className="text-slate-500">Dấu chân tay to toàn thị trường (z 5 phiên)</span>
              <b className="font-mono text-[11px]" style={{ color: (c.zLd5 ?? 0) >= 0 ? UP : DOWN }}>{signed(c.zLd5)}</b>
            </div>
            <ZSpark values={series.map((d) => d.zLd5)} label={`Dấu chân tay to 60 phiên, hiện ${signed(c.zLd5)}`} />
            <div className="flex justify-between text-[9.5px] text-slate-500">
              <span>{isNum(c.zLd5) && c.zLd5 <= -1 ? "▼ tay to xả mạnh" : isNum(c.zLd5) && c.zLd5 >= 1 ? "▲ tay to gom mạnh" : "trung tính"}</span>
              <span>Khối ngoại ròng z <b className="font-mono" style={{ color: (c.zFr5 ?? 0) >= 0 ? UP : DOWN }}>{signed(c.zFr5)}</b></span>
            </div>
          </div>
          <div className="rounded-lg px-2 py-1.5 bg-white/[0.03] border border-white/5">
            <div className="flex items-baseline justify-between text-[9.5px]">
              <span className="text-slate-500">Ngày phân phối / tích luỹ (25 phiên)</span>
              <b className="font-mono text-[11px]"><span style={{ color: DOWN }}>{c.dist25}</span> / <span style={{ color: UP }}>{c.acc25}</span></b>
            </div>
            <div className="flex gap-px mt-1" role="img" aria-label={`25 phiên: ${c.dist25} ngày phân phối, ${c.acc25} ngày tích luỹ`}>
              {last25.map((d) => (
                <span key={d.date} className="flex-1 h-2.5 rounded-sm" title={`${d.date}: ${d.isDist ? "ngày phân phối" : "—"}${d.effortNoResult ? " · nỗ lực không kết quả (VSA)" : ""}`}
                  style={{ background: d.isDist ? DOWN : "rgba(148,163,184,0.18)", outline: d.effortNoResult ? `1px solid ${AMBER}` : undefined }} />
              ))}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              {isNum(c.distPct) ? `Cao hơn ${pct(c.distPct)} các phiên trong 250 phiên trước` : ""}{c.effortNoResult ? " · ⚠ hôm nay: KL lớn nhưng giá đi ít (VSA)" : ""}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ border: `1px solid ${risk.color}55`, background: `${risk.color}12` }}
            title="Trung bình của: phân vị ngày phân phối, dấu chân tay to âm, độ rộng thấp, P(HMM Giảm). Chỉ số mô tả, không phải dự báo.">
            <span className="text-[10px] text-slate-300">Rủi ro dòng tiền rút (Distribution)</span>
            <b className="font-mono text-[12px]" style={{ color: risk.color }}>{c.risk ?? "—"} · {risk.label}</b>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- khối AI
const AXIS: [number, number] = [0.2, 0.9];
const xPos = (v: number) => `${Math.min(100, Math.max(0, ((v - AXIS[0]) / (AXIS[1] - AXIS[0])) * 100))}%`;

/** Một dòng "biểu đồ rừng": KTC 95% (thanh), điểm = trung bình hậu nghiệm, vạch đứt = mức nền. */
function ForestRow({ label, value, mean, lo, hi, base, n, nEff }: { label: string; value: string; mean: number | null; lo: number | null; hi: number | null; base: number | null; n: number; nEff: number }) {
  const color = !isNum(mean) || !isNum(base) ? MUTED : isNum(lo) && lo > base ? UP : isNum(hi) && hi < base ? DOWN : "#cbd5e1";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,7rem)_6.3rem] items-center gap-2 text-[9.5px]" title={`${label}: ${value} · ${n} phiên (hiệu dụng ≈ ${nEff})`}>
      <span className="text-slate-400 leading-tight">{label}: <span className="text-slate-200">{value}</span></span>
      <span className="relative h-3">
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        {isNum(base) && <span className="absolute top-0 bottom-0 w-px border-l border-dashed border-slate-400/70" style={{ left: xPos(base) }} />}
        {isNum(lo) && isNum(hi) && <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded" style={{ left: xPos(lo), width: `calc(${xPos(hi)} - ${xPos(lo)})`, background: `${color}88` }} />}
        {isNum(mean) && <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: xPos(mean), background: color }} />}
      </span>
      <span className="font-mono text-right" style={{ color }}>{pct(mean)} <span className="text-slate-500">[{pct(lo)}–{pct(hi)}]</span></span>
    </div>
  );
}

/** Trọng số đã chuẩn hoá kèm KTC 95% bootstrap: KTC không chứa 0 -> có ý nghĩa (màu), ngược lại xám. */
function WeightRow({ w }: { w: { label: string; coef: number | null; lo: number | null; hi: number | null } }) {
  const R = 2.5;
  const pos = (v: number) => `${((Math.max(-R, Math.min(R, v)) + R) / (2 * R)) * 100}%`;
  const sig = isNum(w.lo) && isNum(w.hi) && (w.lo > 0 || w.hi < 0);
  const color = !sig ? MUTED : (w.coef ?? 0) > 0 ? UP : DOWN;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,7rem)_3.2rem] items-center gap-2 text-[9.5px]" title={`${w.label}: ${signed(w.coef)} [${signed(w.lo)}, ${signed(w.hi)}]${sig ? "" : " — KTC chứa 0"}`}>
      <span className="text-slate-400 leading-tight">{w.label}</span>
      <span className="relative h-3">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-400/50" />
        {isNum(w.lo) && isNum(w.hi) && <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded" style={{ left: pos(w.lo), width: `calc(${pos(w.hi)} - ${pos(w.lo)})`, background: `${color}88` }} />}
        {isNum(w.coef) && <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pos(w.coef), background: color }} />}
      </span>
      <span className="font-mono text-right" style={{ color }}>{signed(w.coef)}</span>
    </div>
  );
}

const VERDICT: Record<string, { glyph: string; text: string; color: string }> = {
  edge: { glyph: "✓", text: "có lợi thế", color: UP },
  negative: { glyph: "✗", text: "ngược kỳ vọng", color: DOWN },
  none: { glyph: "≈", text: "như ngẫu nhiên", color: MUTED },
  insufficient: { glyph: "…", text: "chưa đủ mẫu", color: MUTED },
};
export const INTEL_SIGNALS = ["FOOTPRINT", "IMPULSE2", "HMM_REGIME", "DIVERGENCE", "DIST_DAYS"] as const;
/** Nhãn ngắn hiển thị trong bảng kiểm định (nhãn đầy đủ của Gateway nằm trong tooltip). */
const INTEL_LABELS: Record<string, string> = {
  FOOTPRINT: "Dấu chân tay to (5 phiên)", IMPULSE2: "Impulse 2.0", HMM_REGIME: "Chế độ HMM",
  DIVERGENCE: "Phân kỳ đa khung", DIST_DAYS: "Ngày phân phối bất thường",
};
const IND_LABEL: Record<string, string> = { breadth: "độ rộng", footprint: "tay to" };

export function IntelAiSections({ intel, performance, signalLabels }: { intel: MarketIntel; performance: PerformanceRow[]; signalLabels: Record<string, string> }) {
  const [h, setH] = useState("5");
  const c = intel.current;
  const b = intel.bayes[h];
  const m = intel.models[h];
  const hmmStrip = intel.series.slice(-60);
  const divs = c.divergences.filter((d) => d.type);
  const ctx = { UPTREND: "tiếp diễn tăng", DOWNTREND: "đảo chiều tăng", SIDEWAY: "bứt lên" } as Record<string, string>;
  return (
    <div className="space-y-2.5">
      {/* HMM */}
      <div>
        <div className="flex items-baseline justify-between text-[9px] text-slate-500 mb-0.5">
          <span>Chế độ thị trường HMM (3 trạng thái, fit lại mỗi 20 phiên trên dữ liệu quá khứ)</span>
          {intel.hmm?.trainedThrough && <span className="font-mono">fit tới {intel.hmm.trainedThrough}</span>}
        </div>
        <HmmBar c={c} />
        <div className="flex justify-between text-[9px] font-mono mt-0.5">
          <span style={{ color: DOWN }}>▼ Giảm {pct(c.pBear)}</span><span style={{ color: AMBER }}>■ Đi ngang {pct(c.pNeutral)}</span><span style={{ color: UP }}>▲ Tăng {pct(c.pBull)}</span>
        </div>
        <div className="flex gap-px mt-1" role="img" aria-label="Chế độ HMM 60 phiên gần nhất">
          {hmmStrip.map((d) => {
            const k = isNum(d.pBull) ? [d.pBear!, d.pNeutral!, d.pBull].indexOf(Math.max(d.pBear!, d.pNeutral!, d.pBull)) : -1;
            return <span key={d.date} className="flex-1 h-2 rounded-sm" title={`${d.date}: ${k < 0 ? "—" : ["Giảm", "Đi ngang", "Tăng"][k]}`}
              style={{ background: k < 0 ? "rgba(148,163,184,0.15)" : [DOWN, AMBER, UP][k], opacity: 0.75 }} />;
          })}
        </div>
        {intel.hmm && (
          <div className="text-[9px] text-slate-500 mt-0.5">
            {intel.hmm.states.map((s, k) => <span key={s.label} className="mr-2">{["▼", "■", "▲"][k]} {s.label}: 5 phiên {signed(s.ret5, 1)}% · biến động {fx(s.vol20, 2)}%/phiên · giữ {pct(s.stay)}</span>)}
          </div>
        )}
      </div>

      {/* Bayes */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
          <span className="text-[9px] text-slate-500 min-w-0 flex-1">Xác suất Bayes VN-Index tăng sau T+{h} theo điều kiện hiện tại · KTC 95% · vạch đứt = mức nền</span>
          <span className="inline-flex shrink-0 rounded border border-white/10 overflow-hidden" role="tablist" aria-label="Kỳ hạn">
            {["3", "5", "10"].map((k) => (
              <button key={k} type="button" role="tab" aria-selected={h === k} onClick={() => setH(k)}
                className={`text-[9.5px] px-1.5 py-px ${h === k ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>T+{k}</button>
            ))}
          </span>
        </div>
        {b && (
          <div className="space-y-0.5">
            <ForestRow label="Mọi phiên" value={`${b.base.n} phiên`} mean={b.base.p} lo={null} hi={null} base={b.base.p} n={b.base.n} nEff={Math.round(b.base.n / Number(h))} />
            {b.rows.map((r) => <ForestRow key={r.id} label={r.label} value={r.value} mean={r.mean} lo={r.lo} hi={r.hi} base={b.base.p} n={r.n} nEff={r.nEff} />)}
          </div>
        )}
        <div className="text-[9px] text-slate-500 mt-0.5">
          Chấm xanh/đỏ = KTC nằm hẳn trên/dưới mức nền; xám = chưa khác mức nền. {c.regime && ctx[c.regime] ? `Với trạng thái hiện tại, "tăng" nghĩa là ${ctx[c.regime]}.` : ""}
        </div>
      </div>

      {/* Phân kỳ */}
      <div className="text-[9.5px]">
        <span className="text-slate-500">Phân kỳ đa khung (5/20/60 phiên): </span>
        {divs.length ? divs.map((d) => (
          <span key={`${d.indicator}-${d.window}`} className="inline-block mr-1 px-1 rounded border" style={{ color: d.type === "bullish" ? UP : DOWN, borderColor: d.type === "bullish" ? `${UP}66` : `${DOWN}66` }}>
            {d.type === "bullish" ? "▲ dương" : "▼ âm"} · giá vs {IND_LABEL[d.indicator] ?? d.indicator} · {d.window} phiên
          </span>
        )) : <span className="text-slate-400">không có</span>}
      </div>

      {/* Mô hình tổng hợp */}
      {m && (
        <div className="rounded-lg p-2 border" style={{ borderColor: m.passed ? `${UP}55` : "rgba(255,255,255,0.08)", background: "rgba(167,139,250,0.04)" }}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[9.5px] font-semibold" style={{ color: VIOLET }}>MÔ HÌNH TỔNG HỢP T+{h} · logistic Bayes, walk-forward có purge</span>
            <span className="text-[9px] px-1 rounded border shrink-0" style={{ color: m.passed ? UP : MUTED, borderColor: m.passed ? `${UP}66` : "rgba(148,163,184,0.4)" }}>
              {m.passed ? "✓ ĐẠT KIỂM ĐỊNH" : "CHƯA ĐẠT KIỂM ĐỊNH"}
            </span>
          </div>
          <div className="text-[9.5px] text-slate-400">
            Brier skill ngoài mẫu <b className="font-mono" style={{ color: (m.oos.skill ?? 0) > 0 ? UP : DOWN }}>{signed(m.oos.skill, 3)}</b>
            {" "}KTC 95% [{signed(m.oos.lo, 3)}, {signed(m.oos.hi, 3)}] · {m.oos.n} dự báo (hiệu dụng ≈ {m.oos.nEff ?? "—"}) · đúng chiều {pct(m.oos.hitRate)}
          </div>
          <div className="text-[10px] mt-0.5">
            {m.passed
              ? <>P(VN-Index tăng sau T+{h}) = <b className="font-mono" style={{ color: VIOLET }}>{pct(m.prob)}</b> <span className="text-slate-500">(mức nền {pct(m.baseRate)})</span></>
              : <span className="text-slate-500">Chưa hơn mức nền một cách đáng tin cậy (cận dưới KTC ≤ 0) → không hiển thị xác suất của mô hình.</span>}
          </div>
          <div className="text-[9px] text-slate-500 mt-1 mb-0.5">Trọng số học được (đặc trưng chuẩn hoá) · KTC 95% bootstrap khối · xám = KTC chứa 0</div>
          <div className="space-y-0.5">{m.weights.map((w) => <WeightRow key={w.name} w={w} />)}</div>
        </div>
      )}

      {/* Kiểm định tín hiệu mới */}
      <div>
        <div className="text-[9px] text-slate-500 mb-0.5">Kiểm định tín hiệu mới trong vòng phản hồi (trúng / nền · z cụm) — tín hiệu chưa có lợi thế chỉ để tham khảo</div>
        <table className="w-full table-fixed text-[9px] font-mono">
          <colgroup><col className="w-[34%]" /><col /><col /><col /></colgroup>
          <tbody>
            {INTEL_SIGNALS.map((sig) => (
              <tr key={sig} className="border-t border-white/5">
                <td className="px-1 font-sans text-slate-300 truncate" title={signalLabels[sig] ?? INTEL_LABELS[sig]}>{INTEL_LABELS[sig]}</td>
                {[3, 5, 10].map((hz) => {
                  const r = performance.find((x) => x.signal === sig && x.regime === "ALL" && x.horizon === hz);
                  const v = r ? VERDICT[r.verdict] : null;
                  return (
                    <td key={hz} className="px-0.5 text-right whitespace-nowrap overflow-hidden" title={r ? `T+${hz}: n=${r.n} (hiệu dụng ≈ ${r.effectiveN ?? r.n}) · KTC95% ${pct(r.hitLow)}–${pct(r.hitHigh)}` : `T+${hz}: chưa chấm`}>
                      {r && v ? <><span className="text-slate-200">{pct(r.hitRate)}</span><span className="text-slate-500">/{pct(r.baseline)}</span> <span style={{ color: v.color }}>{v.glyph}</span></> : <span className="text-slate-600">T+{hz} …</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[8.5px] text-slate-500">{intel.notes} Dữ liệu dòng tiền {intel.coverage.footprintDays} phiên; VN-Index {intel.coverage.indexDays} phiên.</div>
    </div>
  );
}
