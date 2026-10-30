// MTF v3 · S4 — vùng củng cố (nền giá) Ngày / Tuần và mô hình trên nền + thang mức hỗ trợ / kháng cự ba khung.
// Phác hoạ nền: đỉnh trái → các nhịp co (đỉnh / đáy sóng) → pivot (vạch đứt) → phá vỡ (mũi tên, nếu có). MÔ TẢ tới khi H3 được kiểm định.
import type { Base3View, Level3View } from "../../../../hooks/useStructure3";

const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));
const dmy = (d: string) => d.split("-").reverse().join("/");

function Sketch({ b }: { b: Base3View }) {
  const W = 220, H = 74, pad = 6;
  const pts: { x: number; y: number }[] = [];
  const seq = [{ t: b.from, p: b.leftHigh }, ...b.contractions.flatMap((c) => [{ t: c.hiDate, p: c.hi }, { t: c.loDate, p: c.lo }])].filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
  const end = b.breakout ? b.pivot * 1.04 : seq[seq.length - 1].p;
  seq.push({ t: b.to, p: end });
  const lo = Math.min(b.low, ...seq.map((s) => s.p)), hi = Math.max(b.leftHigh, end) * 1.005, span = hi - lo || 1;
  const n = seq.length - 1 || 1;
  seq.forEach((s, i) => pts.push({ x: pad + (i / n) * (W - 2 * pad), y: pad + ((hi - s.p) / span) * (H - 2 * pad) }));
  const yPivot = pad + ((hi - b.pivot) / span) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[74px]" role="img" aria-label={`Phác hoạ nền ${b.patternLabel}`} data-testid="base-sketch">
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} rx={4} fill="rgba(56,189,248,0.05)" stroke="rgba(56,189,248,0.18)" />
      <line x1={pad} x2={W - pad} y1={yPivot} y2={yPivot} stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1} />
      <text x={W - pad - 2} y={yPivot - 3} textAnchor="end" fontSize={8} fill="#fbbf24">pivot {price(b.pivot)}</text>
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth={1.4} strokeLinejoin="round" />
      {pts.slice(1, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2} fill={i % 2 ? "#f87171" : "#34d399"} />)}
      {b.breakout && <path d={`M ${pts[pts.length - 1].x - 6} ${pts[pts.length - 1].y + 8} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y} L ${pts[pts.length - 1].x + 2} ${pts[pts.length - 1].y + 9}`} stroke="#34d399" strokeWidth={1.6} fill="none" />}
    </svg>
  );
}

function BaseCard({ tf, b }: { tf: "Ngày" | "Tuần"; b: Base3View | null }) {
  if (!b) return <div className="rounded-lg p-2 text-[10px] text-slate-500" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }}>{tf}: giá đang ở đỉnh mới — chưa có vùng củng cố.</div>;
  const depths = b.contractions.map((c) => c.depthPct);
  return (
    <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid={`base-${tf === "Ngày" ? "D" : "W"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-slate-200">{tf}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${b.vcp ? "text-emerald-200 border-emerald-400/50 bg-emerald-500/10" : "text-sky-200 border-sky-400/40 bg-sky-500/10"}`} data-testid="base-pattern">{b.patternLabel}</span>
        <span className="font-mono text-[9.5px] text-slate-400" title="Dấu chân kỹ thuật: số tuần · độ sâu lớn nhất / nhịp cuối (%) · số lần thu hẹp">{b.footprint}</span>
        {b.breakout && <span className="rounded border border-emerald-400/50 px-1 text-[9.5px] text-emerald-200" data-testid="base-breakout">Phá vỡ {dmy(b.breakout.date)} · KL ×{b.breakout.volRatio.toLocaleString("vi-VN")}</span>}
        {!b.valid && <span className="rounded border border-amber-400/40 px-1 text-[9.5px] text-amber-200" title={b.reasons.join(" · ")}>Chưa đạt chuẩn nền</span>}
      </div>
      <Sketch b={b} />
      <div className="grid grid-cols-2 gap-x-2 text-[9.5px] text-slate-400">
        <span>Đỉnh trái <b className="text-slate-200">{price(b.leftHigh)}</b> · sâu <b className="text-slate-200">{b.depthPct.toLocaleString("vi-VN")}%</b></span>
        <span>{b.bars} {tf === "Ngày" ? "phiên" : "tuần"} · từ {dmy(b.from)}</span>
        <span title="Độ sâu từng nhịp thu hẹp — VCP khi mỗi nhịp ≤ 0,75 nhịp trước">Nhịp co {depths.length ? depths.map((d) => `−${d.toLocaleString("vi-VN")}%`).join(" → ") : "—"}</span>
        <span title="KL trung bình 10 phiên cuối / 50 phiên — cạn khi ≤ 0,75">KL {b.dryUp != null ? `×${b.dryUp.toLocaleString("vi-VN")}` : "—"} {b.dry ? <b className="text-emerald-300">cạn</b> : ""}</span>
        {b.undercuts.length > 0 && <span title="Phiên thủng đáy trước rồi đóng cửa lại trên — dấu hiệu rũ bỏ / gom hàng">Rũ bỏ {b.undercuts.length} lần</span>}
        {b.baseCount != null && <span title="Nền thứ mấy kể từ đầu giai đoạn 2 — nền 1–2 tốt nhất, 4–5 dễ thất bại">Nền thứ <b className={b.baseCount >= 4 ? "text-amber-300" : "text-slate-200"}>{b.baseCount}</b> của GĐ 2</span>}
      </div>
      {!b.valid && <p className="text-[9px] text-amber-300/80">{b.reasons.join(" · ")}</p>}
    </div>
  );
}

function Levels({ levels, close }: { levels: Level3View[]; close: number | null }) {
  return (
    <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid="levels3">
      <div className="text-[10px] font-bold text-slate-200">Mức hỗ trợ / kháng cự <span className="font-normal text-slate-500">· gom đỉnh–đáy sóng Tháng (×3) · Tuần (×2) · Ngày</span></div>
      {levels.length === 0 ? <p className="text-[9.5px] text-slate-500">Chưa có mức có ≥ 2 lần chạm.</p> : (
        <ul className="space-y-0.5">
          {levels.map((l) => (
            <li key={`${l.price}-${l.role}`} className="flex items-center gap-1.5 text-[9.5px]" data-testid="level3-row">
              <span className={`w-14 rounded px-1 text-center ${l.role === "resistance" ? "bg-rose-500/10 text-rose-200" : "bg-emerald-500/10 text-emerald-200"}`}>{l.role === "resistance" ? "Kháng cự" : "Hỗ trợ"}</span>
              <b className="w-16 font-mono text-slate-100">{price(l.price)}</b>
              <span className="text-slate-500">{close ? `${(((l.price / close) - 1) * 100).toFixed(1).replace(".", ",")}%` : ""}</span>
              <span className="flex gap-0.5">{l.frames.map((f) => <i key={f} className="not-italic rounded border border-slate-600/60 px-1 text-[8.5px] text-slate-300">{f === "D" ? "N" : f === "W" ? "T" : "Th"}</i>)}</span>
              <span className="text-slate-500">{l.touches} lần chạm</span>
              {l.flipped && <span className="text-amber-200" title="Từng là kháng cự nay thành hỗ trợ (hoặc ngược lại)">đổi vai</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BasePanel({ D, W, levels, close }: { D: Base3View | null; W: Base3View | null; levels: Level3View[]; close: number | null }) {
  return (
    <section className="space-y-1.5" data-testid="base-panel" aria-label="Vùng củng cố và mức giá">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vùng củng cố · mô hình trên nền</span>
        <span className="ml-auto rounded border border-slate-600/60 px-1.5 py-0.5 text-[9.5px] text-slate-400" title="Phá vỡ nền trong giai đoạn 2 (H3) kiểm định ở S7">MÔ TẢ</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">
        <BaseCard tf="Ngày" b={D} /><BaseCard tf="Tuần" b={W} /><Levels levels={levels} close={close} />
      </div>
    </section>
  );
}
