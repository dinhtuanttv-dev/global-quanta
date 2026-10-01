import { useIntradayCycle, type IntradayCycle, type Prob } from "../../../hooks/useIntradayCycle";

// Thang RVOL PHÂN KỲ quanh 1× (bình thường): xanh dương = cạn, xám = bình thường, cam = bùng nổ.
// Cặp #2563eb/#ea580c đạt kiểm tra CVD (ΔE 31) và không trùng cặp xanh lá/đỏ dành cho chiều giá.
const LOW = [37, 99, 235];
const MID = [100, 116, 139];
const HIGH = [234, 88, 12];
const ACCENT = "#0284c7";
const GRID = "rgba(148,163,184,0.18)";

function rvolColor(rvol: number | null): string {
  if (rvol === null || !Number.isFinite(rvol)) return "rgba(148,163,184,0.25)";
  const t = Math.max(-1, Math.min(1, Math.log2(Math.max(rvol, 1e-3)))); // 0.5× -> -1, 2× -> +1
  const [from, to, w] = t < 0 ? [MID, LOW, -t] : [MID, HIGH, t];
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * w));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pct = (p: number | null | undefined) => (p === null || p === undefined ? "—" : `${Math.round(p * 100)}%`);
const fmtVol = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)} tr`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)} k`;
  return String(Math.round(v));
};

/** Dải nhịp 17 khung: dải xám = KL điển hình p25–p75 (vạch = trung vị); cột màu = KL hôm nay theo RVOL. */
function RhythmStrip({ data }: { data: IntradayCycle }) {
  const prof = data.profile!;
  const cur = data.current;
  const W = 340, H = 80, top = 12, n = prof.length;
  const max = Math.max(...prof.map((p) => p.p75), ...(cur?.buckets ?? []).map((b) => b?.volume ?? 0), 1);
  const bw = W / n;
  const y = (v: number) => top + (H - top) - (v / max) * (H - top);
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full h-28" role="img" aria-label="Nhịp khối lượng 17 khung trong phiên so với mức điển hình">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={GRID} />
      {prof.map((p, i) => {
        const b = cur?.buckets[i] ?? null;
        const rv = cur?.bucketRvol[i] ?? null;
        const isCurrent = cur && !cur.sessionDone && i === cur.lastBucket;
        const isNext = cur?.next?.bucket === i;
        const x = i * bw;
        return (
          <g key={p.id}>
            <rect x={x} y={0} width={bw} height={H + 12} fill="transparent">
              <title>{`${p.label}: điển hình ${fmtVol(p.median)} (${fmtVol(p.p25)}–${fmtVol(p.p75)})${b ? ` · hôm nay ${fmtVol(b.volume)} = ${rv?.toFixed(2)}×` : ""}`}</title>
            </rect>
            <rect x={x + 2} y={y(p.p75)} width={bw - 4} height={Math.max(1, y(p.p25) - y(p.p75))} rx={1.5} fill="rgba(148,163,184,0.22)" pointerEvents="none" />
            <line x1={x + 2} x2={x + bw - 2} y1={y(p.median)} y2={y(p.median)} stroke="#94a3b8" strokeWidth={1} pointerEvents="none" />
            {b && <rect x={x + bw * 0.28} y={y(b.volume)} width={bw * 0.44} height={Math.max(1, H - y(b.volume))} rx={1.5} fill={rvolColor(rv)} pointerEvents="none" />}
            {b && rv !== null && <text x={x + bw / 2} y={Math.max(9, y(b.volume) - 2)} textAnchor="middle" fontSize={6.5} fill="#e2e8f0" pointerEvents="none">{rv.toFixed(1)}×</text>}
            {isCurrent && <rect x={x + 0.5} y={0.5} width={bw - 1} height={H - 1} fill="none" stroke="#e2e8f0" strokeWidth={1} strokeDasharray="2 2" rx={2} pointerEvents="none" />}
            {isNext && <rect x={x + 0.5} y={0.5} width={bw - 1} height={H - 1} fill="none" stroke={ACCENT} strokeWidth={1.2} rx={2} pointerEvents="none" />}
            {(i % 2 === 0 || i === n - 1) && <text x={x + bw / 2} y={H + 9} textAnchor="middle" fontSize={6.5} fill="#94a3b8">{p.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function ProbRow({ label, prob, baseline, validated }: { label: string; prob: Prob; baseline: number; validated: boolean }) {
  const trusted = prob.enough && validated;
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-slate-300">{label}</span>
        <span className={trusted ? "text-slate-100 font-semibold" : "text-slate-500"}>{pct(prob.p)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="absolute inset-y-0 rounded-full" style={{ left: `${prob.low * 100}%`, width: `${(prob.high - prob.low) * 100}%`, background: "rgba(2,132,199,0.35)" }} />
        <div className="absolute inset-y-0 w-0.5" style={{ left: `calc(${prob.p * 100}% - 1px)`, background: trusted ? "#e2e8f0" : "#64748b" }} />
        <div className="absolute inset-y-0 w-px" style={{ left: `${baseline * 100}%`, background: "#94a3b8" }} title="Mức nền của khung" />
      </div>
      <div className="text-[8.5px] text-slate-500">
        n={prob.n} · khoảng 90%: {pct(prob.low)}–{pct(prob.high)} · nền {pct(baseline)}
        {!prob.enough && " · ít mẫu"}
      </div>
    </div>
  );
}

const DIR_ROWS: [string, string][] = [["up", "Tăng"], ["flat", "Ngang"], ["down", "Giảm"]];
const VOL_COLS: [string, string][] = [["low", "KL thấp"], ["norm", "Bình thường"], ["high", "KL cao"]];

/** Ma trận giá – KL: xác suất trạng thái của KHUNG KẾ TIẾP, điều kiện theo trạng thái khung vừa qua (ô viền). */
function PriceVolumeMatrix({ cur }: { cur: NonNullable<IntradayCycle["current"]> }) {
  const tr = cur.transitionsFromCell;
  if (!tr || !cur.cell) return null;
  const max = Math.max(...Object.values(tr.to).map((p) => p.p), 0.01);
  return (
    <div>
      <table className="w-full text-[9px] font-mono border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr><th />{VOL_COLS.map(([k, l]) => <th key={k} className="text-slate-500 font-sans font-normal">{l}</th>)}</tr>
        </thead>
        <tbody>
          {DIR_ROWS.map(([d, dl]) => (
            <tr key={d}>
              <th className="text-left text-slate-500 font-sans font-normal pr-1">{dl}</th>
              {VOL_COLS.map(([v]) => {
                const cell = `${d}:${v}`;
                const p = tr.to[cell];
                const isFrom = cell === cur.cell;
                return (
                  <td key={v} className="text-center rounded py-1 text-slate-100"
                    style={{ background: `rgba(2,132,199,${0.08 + 0.6 * (p.p / max)})`, outline: isFrom ? "1.5px solid #e2e8f0" : undefined }}
                    title={`${dl} + ${VOL_COLS.find((c) => c[0] === v)![1]}: ${pct(p.p)} (${pct(p.low)}–${pct(p.high)})${isFrom ? " · trạng thái khung vừa qua" : ""}`}>
                    {pct(p.p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[9px] text-slate-400 mt-1">
        Ô viền = trạng thái khung vừa qua (n={tr.n}). Trong 2 khung tới: vào pha <b className="text-slate-200">KL cao + giá tăng</b> {pct(cur.enterHighUpWithin2)} ·{" "}
        <b className="text-slate-200">KL cao + giá giảm</b> {pct(cur.enterHighDownWithin2)}
      </div>
    </div>
  );
}

export default function IntradayCyclePanel({ symbol }: { symbol: string }) {
  const { data, error, isLoading } = useIntradayCycle(symbol);
  const box = "rounded-lg p-2.5";
  const boxStyle = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" };

  if (isLoading && !data) return <div className="text-[10px] text-slate-500 mb-2">Đang dựng mô hình nhịp khối lượng (120 phiên nến phút SSI)…</div>;
  if (error) return <div className="text-[10px] text-rose-400 mb-2">Không tải được nhịp khối lượng: {String(error.message)}</div>;
  if (!data) return null;
  if (!data.ready) return <div className="text-[10px] text-slate-500 mb-2">Nhịp khối lượng: {data.reason}</div>;

  const cur = data.current;
  const v = data.validation!;
  const next = cur?.next ?? null;

  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-semibold text-slate-200">
          Nhịp khối lượng trong phiên · {data.viewDate}{" "}
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[8.5px] ${data.live ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
            {data.live ? "đang giao dịch" : "phiên đã đóng"}
          </span>
        </div>
        <div className="text-[8.5px] text-slate-500">Mô hình {data.sessions} phiên ({data.from} → {data.to}) · khung 15'</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className={`${box} lg:col-span-2`} style={boxStyle}>
          <RhythmStrip data={data} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8.5px] text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2" style={{ background: "rgba(148,163,184,0.35)" }} />KL điển hình (p25–p75, vạch = trung vị)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: rvolColor(0.5) }} />Cạn ≤0,5×</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: rvolColor(1) }} />Bình thường</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: rvolColor(2) }} />Bùng nổ ≥2×</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 border border-dashed border-slate-300" />Khung đang chạy</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 border" style={{ borderColor: ACCENT }} />Khung kế tiếp</span>
          </div>
          {cur && (
            <div className="grid grid-cols-3 gap-2 mt-2 text-[9.5px]">
              <div><div className="text-slate-500">KL lũy kế</div><div className="text-slate-100 font-semibold">{fmtVol(cur.cumVolume)}</div></div>
              <div><div className="text-slate-500">RVOL theo thời điểm</div><div className="font-semibold" style={{ color: rvolColor(cur.timeAdjustedRvol) }}>{cur.timeAdjustedRvol !== null ? `${cur.timeAdjustedRvol.toFixed(2)}×` : "—"}</div></div>
              <div><div className="text-slate-500">{cur.sessionDone ? "KL cả phiên" : "Dự phóng cuối phiên"}</div>
                <div className="text-slate-100 font-semibold">{cur.sessionDone ? fmtVol(cur.cumVolume) : fmtVol(cur.projectedVolume)}</div>
                {!cur.sessionDone && cur.projectedRange && <div className="text-slate-500 text-[8.5px]">{fmtVol(cur.projectedRange[0])}–{fmtVol(cur.projectedRange[1])}</div>}
              </div>
            </div>
          )}
        </div>

        <div className={box} style={boxStyle}>
          {next ? (
            <>
              <div className="text-[10px] text-slate-200 font-semibold mb-1">Khung kế tiếp {next.label}</div>
              {cur?.state && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {[cur.state.priceLabel, cur.state.vwapPos === "Vup" ? "trên VWAP" : "dưới VWAP", cur.state.rvolLabel].map((c) => (
                    <span key={c} className="px-1.5 py-0.5 rounded bg-white/5 text-[8.5px] text-slate-300">{c}</span>
                  ))}
                </div>
              )}
              <ProbRow label="Bùng nổ KL (≥2× điển hình)" prob={next.surge} baseline={next.baseline.surge} validated={v.validated.surge} />
              <ProbRow label="Cạn KL (≤0,5× điển hình)" prob={next.dry} baseline={next.baseline.dry} validated={v.validated.dry} />
              <div className="text-[9px] text-slate-400 mt-1">Giá khung tới: tăng {pct(next.up.p)} · giảm {pct(next.down.p)}</div>
            </>
          ) : (
            <div className="text-[10px] text-slate-500">{cur?.sessionDone ? "Phiên đã đóng — xác suất khung kế tiếp hiển thị trong giờ giao dịch." : "Chưa có dữ liệu phiên."}</div>
          )}
          <div className={`mt-2 text-[8.5px] ${v.validated.surge ? "text-emerald-400" : "text-amber-400"}`}>
            {v.validated.surge
              ? `✓ Đã kiểm định walk-forward ${v.evaluatedSessions} phiên (Brier skill bùng nổ ${v.surge.brierSkill?.toFixed(2)})`
              : `⚠ Chưa đủ tin cậy: mô hình chưa vượt mức nền (${v.surge.brierSkill === null ? `chỉ ${v.surge.events} lần bùng nổ` : `skill ${v.surge.brierSkill.toFixed(2)}`}) — số hiển thị mờ`}
          </div>
        </div>
      </div>

      {cur?.transitionsFromCell && (
        <div className={`${box} mt-2`} style={boxStyle}>
          <div className="text-[10px] text-slate-200 font-semibold mb-1">Ma trận giá – khối lượng (xác suất trạng thái khung kế tiếp)</div>
          <PriceVolumeMatrix cur={cur} />
        </div>
      )}
      <div className="text-[8.5px] text-slate-500 mt-1">{data.disclaimer}</div>
    </div>
  );
}
