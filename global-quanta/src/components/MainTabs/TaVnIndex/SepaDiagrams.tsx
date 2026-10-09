// Sơ đồ của bảng phụ SEPA — vẽ lại theo hình trong sách "Giao dịch như một phù thủy chứng khoán" (Minervini, NXB KT TP.HCM 2019):
//   FootprintDiagram  Hình 10.6  dấu chân kỹ thuật VCP "40W 31/3 4T": các lần thu hẹp như bậc thang (độ sâu × độ rộng)
//   ContractionShapes Hình 10.4  các dạng 1T…5T, tô dạng của mã
//   StageCycleMap     Hình 5.6   chữ "S" của 4 giai đoạn (S1 → S2 → S3 → S4), đánh dấu giai đoạn hiện tại
//   QuarterlyGrowth   Hình 10.38 tăng trưởng LNST / doanh thu từng quý (so cùng kỳ)
//   RLadder           Chương 12–13: điểm mua, dừng lỗ, 2R, 3R (dời stop về hoà vốn)
//   RoiCurve          Hình 13.1/13.2: ROI kép sau 10 lệnh theo cặp lãi/lỗ 2:1, tỷ lệ thắng 40% và 50%
// Màu dùng chung với các bảng phụ khác (đã kiểm định trên nền tối): tăng #059669, giảm #e11d48, nhấn #0284c7, hổ phách #d97706.
// Chữ luôn dùng màu chữ; màu chỉ mang danh tính của nét vẽ.
import type { SepaContraction } from "../../../hooks/useSepa";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const AMBER = "#d97706";
const GRID = "rgba(148,163,184,0.16)";
const INK = "#cbd5e1";
const MUTED = "#94a3b8";
const DIM = "#64748b";

const fmtP = (v: number) => Math.round(v).toLocaleString("vi-VN");
const DAY = 86_400_000;
const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;

// ------------------------------------------------------------------ Hình 10.6

export function FootprintDiagram({ contractions, depthsPct, footprint, baseStart, baseEnd, leftHigh }: {
  contractions: SepaContraction[]; depthsPct: number[]; footprint: string; baseStart: string; baseEnd: string; leftHigh: number;
}) {
  // Như Hình 10.6: mỗi lần thu hẹp là một "bậc" (cặp đường đỉnh/đáy nét đứt) xếp từ trái sang phải; trục dọc là giá thật,
  // trục ngang chia đều theo thứ tự T (độ rộng thật của nền ghi ở trục dưới).
  const W = 300, H = 150, L = 34, B = 26, T = 14, R = 8;
  const lo = Math.min(...contractions.map((c) => c.day)), hi = Math.max(leftHigh, ...contractions.map((c) => c.dinh));
  const n = contractions.length, slot = (W - L - R) / Math.max(1, n);
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const weeks = Math.round((dnum(baseEnd) - dnum(baseStart)) / 7);
  const pct = (i: number, c: SepaContraction) => String(depthsPct[i] ?? Math.round((1 - c.day / c.dinh) * 1000) / 10).replace(".", ",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-footprint"
      aria-label={`Dấu chân kỹ thuật ${footprint}: ${contractions.map((c, i) => `T${i + 1} −${pct(i, c)}%`).join(", ")}`}>
      <text x={L} y={9} fontSize={9} fontWeight={700} fill={INK}>Dấu chân kỹ thuật VCP · {footprint}</text>
      <line x1={L - 12} x2={L - 12} y1={y(hi)} y2={y(lo)} stroke={MUTED} />
      <line x1={L - 16} x2={L - 8} y1={y(hi)} y2={y(hi)} stroke={MUTED} />
      <line x1={L - 16} x2={L - 8} y1={y(lo)} y2={y(lo)} stroke={MUTED} />
      <text x={L - 18} y={(y(hi) + y(lo)) / 2} fontSize={8} fill={MUTED} textAnchor="middle" transform={`rotate(-90 ${L - 18} ${(y(hi) + y(lo)) / 2})`}>Độ sâu</text>
      <line x1={L} x2={W - R} y1={H - 12} y2={H - 12} stroke={MUTED} />
      <line x1={L} x2={L} y1={H - 16} y2={H - 8} stroke={MUTED} />
      <line x1={W - R} x2={W - R} y1={H - 16} y2={H - 8} stroke={MUTED} />
      <text x={(L + W - R) / 2} y={H - 2} fontSize={8} fill={MUTED} textAnchor="middle">Độ rộng · {weeks} tuần · {n} lần thu hẹp</text>
      {contractions.map((c, i) => {
        const xa = L + i * slot + 4, xb = L + (i + 1) * slot - 4, last = i === n - 1;
        return (
          <g key={`${c.ngay_dinh}-${i}`}>
            <line x1={xa} x2={xb} y1={y(c.dinh)} y2={y(c.dinh)} stroke={last ? AMBER : MUTED} strokeWidth={1.5} strokeDasharray="4 2" />
            <line x1={xa} x2={xb} y1={y(c.day)} y2={y(c.day)} stroke={last ? AMBER : MUTED} strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={(xa + xb) / 2} y={Math.min(H - 16, y(c.day) + 10)} fontSize={9} fontWeight={700} fill={INK} textAnchor="middle">−{pct(i, c)}%</text>
            <text x={(xa + xb) / 2} y={Math.max(T + 8, y(c.dinh) - 3)} fontSize={7.5} fill={MUTED} textAnchor="middle">T{i + 1}</text>
            <title>{`T${i + 1}: đỉnh ${fmtP(c.dinh)} (${c.ngay_dinh}) → đáy ${fmtP(c.day)} (${c.ngay_day})`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ Hình 10.4

function shapePath(k: number, x0: number, w: number, top: number, h: number) {
  // đỉnh trái -> k lần thu hẹp, mỗi lần ~1/2 lần trước, kết thúc gần đỉnh
  const pts: [number, number][] = [[x0, top]];
  let d = h;
  const step = w / (2 * k);
  for (let i = 0; i < k; i++) {
    pts.push([x0 + step * (2 * i + 1), top + d]);
    pts.push([x0 + step * (2 * i + 2), top + (i === k - 1 ? 0 : d * 0.18)]);
    d *= 0.5;
  }
  return pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
}

export function ContractionShapes({ count }: { count: number }) {
  const W = 300, H = 46, cell = W / 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-shapes" aria-label={`Dạng thu hẹp ${count}T`}>
      {[1, 2, 3, 4, 5].map((k) => {
        const on = k === Math.min(5, count);
        return (
          <g key={k}>
            {on && <rect x={(k - 1) * cell + 2} y={1} width={cell - 4} height={H - 2} rx={5} fill="rgba(217,119,6,0.12)" stroke={AMBER} strokeWidth={1} />}
            <text x={(k - 1) * cell + cell / 2} y={12} fontSize={9} textAnchor="middle" fontWeight={on ? 800 : 500} fill={on ? INK : DIM}>{k}T{k === 5 && count > 5 ? "+" : ""}</text>
            <path d={shapePath(k, (k - 1) * cell + 8, cell - 16, 18, 22)} fill="none" stroke={on ? AMBER : DIM} strokeWidth={on ? 2 : 1.2} strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ Hình 5.6

const STAGE_TEXT: Record<number, string> = { 1: "GĐ1 · tích luỹ", 2: "GĐ2 · tăng giá", 3: "GĐ3 · phân phối", 4: "GĐ4 · giảm giá" };

export function StageCycleMap({ stage }: { stage: number }) {
  const W = 300, H = 128;
  // chữ "S" của chu kỳ: S1 đi ngang thấp -> S2 đi lên -> S3 đỉnh tròn -> S4 rơi
  const seg: Record<number, string> = {
    1: "M10,98 C40,100 60,96 82,96",
    2: "M82,96 C110,94 140,40 172,30",
    3: "M172,30 C190,22 214,22 230,34",
    4: "M230,34 C250,52 262,86 290,96",
  };
  const label: Record<number, [number, number]> = { 1: [40, 88], 2: [120, 58], 3: [200, 16], 4: [272, 70] };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-stage-map" aria-label={`Chu kỳ 4 giai đoạn — hiện tại ${STAGE_TEXT[stage] ?? "chưa xác định"}`}>
      <line x1={0} x2={W} y1={110} y2={110} stroke={GRID} />
      {[1, 2, 3, 4].map((s) => {
        const on = s === stage;
        return (
          <g key={s}>
            <path d={seg[s]} fill="none" stroke={on ? (s === 2 ? UP : s === 4 ? DOWN : AMBER) : DIM} strokeWidth={on ? 3.5 : 1.5} strokeLinecap="round" strokeDasharray={on ? undefined : "4 3"} />
            <text x={label[s][0]} y={label[s][1]} fontSize={on ? 10 : 9} fontWeight={on ? 800 : 500} fill={on ? INK : DIM} textAnchor="middle">S{s}</text>
            <text x={label[s][0]} y={label[s][1] + 10} fontSize={7.5} fill={on ? MUTED : DIM} textAnchor="middle">{STAGE_TEXT[s].split(" · ")[1]}</text>
          </g>
        );
      })}
      {stage === 2 && <text x={150} y={124} fontSize={8} fill={MUTED} textAnchor="middle">Thời điểm tốt nhất để mua là giai đoạn 2 (s.99)</text>}
    </svg>
  );
}

// ------------------------------------------------------------------ Hình 10.38

/** Nhãn 6 quý gần nhất, lùi từ quý mới nhất "Qn/yyyy". */
export function quarterLabels(latest: string | null | undefined, k: number): string[] {
  const m = /^Q(\d)\/(\d{4})$/.exec(latest ?? "");
  if (!m) return Array.from({ length: k }, (_, i) => `q${i + 1}`);
  let q = Number(m[1]), y = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < k; i++) { out.unshift(`Q${q}/${String(y).slice(2)}`); q--; if (q === 0) { q = 4; y--; } }
  return out;
}

export function QuarterlyGrowth({ np, rev, latest }: { np: (number | null)[]; rev: (number | null)[]; latest?: string | null }) {
  const k = Math.max(np.length, rev.length);
  const labels = quarterLabels(latest, k);
  const vals = [...np, ...rev].filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return <div className="text-[10px] text-slate-500 py-4 text-center">Chưa đủ quý để so cùng kỳ (cần ≥ 5 quý liên tiếp).</div>;
  const cap = (v: number) => Math.max(-1.5, Math.min(3, v)); // cắt hiển thị tại −150% / +300% (chữ vẫn ghi số thật)
  const mx = Math.max(0.3, ...vals.map(cap)), mn = Math.min(0, ...vals.map(cap));
  const W = 300, H = 110, top = 12, bot = 18, cw = W / k;
  const y = (v: number) => top + ((mx - cap(v)) / (mx - mn || 1)) * (H - top - bot);
  const y0 = y(0);
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-quarterly"
        aria-label={`Tăng trưởng so cùng kỳ: ${labels.map((l, i) => `${l} LNST ${pct(np[i] ?? null)} DT ${pct(rev[i] ?? null)}`).join("; ")}`}>
        <line x1={0} x2={W} y1={y0} y2={y0} stroke={MUTED} />
        <line x1={0} x2={W} y1={y(0.25)} y2={y(0.25)} stroke={GRID} strokeDasharray="3 3" />
        <text x={W - 2} y={y(0.25) - 2} fontSize={7.5} fill={DIM} textAnchor="end">+25%</text>
        {labels.map((l, i) => {
          const a = np[i] ?? null, b = rev[i] ?? null, bw = cw * 0.3;
          const bar = (v: number | null, dx: number, color: string) => v == null ? null : (
            <rect x={i * cw + cw / 2 + dx} y={Math.min(y(v), y0)} width={bw} height={Math.max(1.5, Math.abs(y(v) - y0))} rx={2} fill={color}>
              <title>{`${l}: ${color === ACCENT ? "LNST" : "Doanh thu"} ${pct(v)} so cùng kỳ`}</title>
            </rect>
          );
          return (
            <g key={l}>
              {bar(a, -bw - 1, ACCENT)}
              {bar(b, 1, AMBER)}
              <text x={i * cw + cw / 2} y={H - 6} fontSize={8} textAnchor="middle" fill={i === k - 1 ? INK : MUTED}>{l}</text>
              {i === k - 1 && a != null && <text x={i * cw + cw / 2} y={Math.max(9, Math.min(y(a), y0) - 3)} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={INK}>{pct(a)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-3 text-[9px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: ACCENT }} />LNST (so cùng kỳ)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: AMBER }} />Doanh thu</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Chương 12–13

export function RLadder({ entry, stop, pivot, target2r, target3r }: { entry: number; stop: number; pivot?: number | null; target2r: number; target3r: number }) {
  const W = 300, H = 132, x0 = 70, x1 = 150;
  const levels = [
    { v: target3r, label: "3R · dời stop về hoà vốn", color: UP, dash: "6 3" },
    { v: target2r, label: "2R · R:R tối thiểu 2:1", color: UP, dash: "3 3" },
    ...(pivot ? [{ v: pivot, label: "Pivot", color: MUTED, dash: "5 3" }] : []),
    { v: entry, label: "Điểm mua", color: ACCENT, dash: undefined },
    { v: stop, label: "Dừng lỗ", color: DOWN, dash: "2 3" },
  ];
  const hi = Math.max(...levels.map((l) => l.v)), lo = Math.min(...levels.map((l) => l.v));
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * (H - 16);
  const lab = levels.map((l) => ({ ...l, ly: y(l.v) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < lab.length; i++) if (lab[i].ly - lab[i - 1].ly < 11) lab[i].ly = lab[i - 1].ly + 11;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-r-ladder" aria-label={`Kế hoạch: mua ${fmtP(entry)}, dừng lỗ ${fmtP(stop)}, 2R ${fmtP(target2r)}, 3R ${fmtP(target3r)}`}>
      <rect x={x0} y={y(entry)} width={x1 - x0} height={Math.max(2, y(stop) - y(entry))} fill={DOWN} opacity={0.14} />
      <rect x={x0} y={y(target2r)} width={x1 - x0} height={Math.max(2, y(entry) - y(target2r))} fill={UP} opacity={0.12} />
      {levels.map((l) => <line key={l.label} x1={x0} x2={x1} y1={y(l.v)} y2={y(l.v)} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} />)}
      {lab.map((l) => (
        <g key={`t${l.label}`}>
          <text x={x0 - 4} y={l.ly + 3} fontSize={9} fontFamily="ui-monospace,monospace" fill={INK} textAnchor="end">{fmtP(l.v)}</text>
          <text x={x1 + 6} y={l.ly + 3} fontSize={9} fill={INK}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

const ROI_PAIRS: [number, number][] = [[4, 2], [6, 3], [8, 4], [12, 6], [14, 7], [16, 8], [20, 10], [24, 12], [30, 15], [36, 18], [42, 21], [48, 24], [54, 27], [60, 30], [70, 35], [80, 40], [90, 45], [100, 50]];
export const compoundRoi = (w: number, g: number, l: number, n = 10) => (1 + g) ** (w * n) * (1 - l) ** (n - w * n) - 1;

export function RoiCurve({ stopPct }: { stopPct: number | null }) {
  const W = 300, H = 130, L = 30, B = 22, T = 10;
  const series = [{ w: 0.4, color: AMBER, dash: undefined as string | undefined }, { w: 0.5, color: ACCENT, dash: "5 3" }];
  const ys = series.flatMap((s) => ROI_PAIRS.map(([g, l]) => compoundRoi(s.w, g / 100, l / 100)));
  const lo = Math.max(-0.8, Math.min(...ys)), hi = Math.min(1.2, Math.max(...ys));
  const x = (i: number) => L + (i / (ROI_PAIRS.length - 1)) * (W - L - 6);
  const y = (v: number) => T + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (H - T - B);
  const mine = stopPct != null ? ROI_PAIRS.reduce((b, p, i) => (Math.abs(p[1] - stopPct * 100) < Math.abs(ROI_PAIRS[b][1] - stopPct * 100) ? i : b), 0) : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="sepa-roi"
        aria-label="ROI kép sau 10 lệnh với tỷ lệ lãi/lỗ 2:1 (Hình 13.2) cho tỷ lệ thắng 40% và 50%">
        {[0].map((v) => <line key={v} x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke={MUTED} />)}
        <text x={L - 3} y={y(0) + 3} fontSize={8} fill={MUTED} textAnchor="end">0%</text>
        <text x={L - 3} y={y(hi) + 6} fontSize={8} fill={DIM} textAnchor="end">{Math.round(hi * 100)}%</text>
        <text x={L - 3} y={y(lo)} fontSize={8} fill={DIM} textAnchor="end">{Math.round(lo * 100)}%</text>
        {mine != null && <line x1={x(mine)} x2={x(mine)} y1={T} y2={H - B} stroke={MUTED} strokeDasharray="2 2" />}
        {series.map((s) => (
          <g key={s.w}>
            <path d={ROI_PAIRS.map(([g, l], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(compoundRoi(s.w, g / 100, l / 100)).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
            {ROI_PAIRS.map(([g, l], i) => (
              <circle key={i} cx={x(i)} cy={y(compoundRoi(s.w, g / 100, l / 100))} r={i === mine ? 4 : 2} fill={s.color} stroke="#02060f" strokeWidth={i === mine ? 1.5 : 0}>
                <title>{`Thắng ${s.w * 100}% · lãi ${g}% / lỗ ${l}%: ROI 10 lệnh ${(compoundRoi(s.w, g / 100, l / 100) * 100).toFixed(1)}%`}</title>
              </circle>
            ))}
          </g>
        ))}
        {[0, 6, 11, 17].map((i) => <text key={i} x={x(i)} y={H - 8} fontSize={7.5} fill={MUTED} textAnchor="middle">{ROI_PAIRS[i][0]}/{ROI_PAIRS[i][1]}</text>)}
        <text x={(L + W) / 2} y={H - 0.5} fontSize={7.5} fill={DIM} textAnchor="middle">lãi / lỗ (%) — tỷ lệ 2:1</text>
      </svg>
      <div className="flex flex-wrap gap-3 text-[9px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: AMBER }} />Tỷ lệ thắng 40%</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: ACCENT }} />Tỷ lệ thắng 50%</span>
        {mine != null && <span>│ mức dừng lỗ của kế hoạch ≈ {ROI_PAIRS[mine][1]}%</span>}
      </div>
    </div>
  );
}
