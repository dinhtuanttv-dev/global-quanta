// Biểu đồ 2D của Trạng thái thị trường. Mọi điểm đều vẽ từ dữ liệu Gateway; thiếu số thì không vẽ.
import type { ImpactItem, IndexImpactDoc, MatrixScope, StatePoint } from "../../../../hooks/useTradingMatrix";
import { vn, when } from "./MatrixCards";

const AXIS = "rgba(148,163,184,0.35)", GRID = "rgba(148,163,184,0.12)", TXT = "#94a3b8", INK = "#e2e8f0", UP = "#34d399", DOWN = "#fb7185", GOLD = "#fbbf24";
const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const sign = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${vn(Math.abs(v), d)}`;

export const ZONE_VI: Record<string, string> = {
  "up-low": "Tích cực, yên", "up-mid": "Tích cực", "up-high": "Tích cực, căng",
  "mid-low": "Cân bằng, yên", "mid-mid": "Cân bằng", "mid-high": "Cân bằng, căng",
  "down-low": "Tiêu cực, yên", "down-mid": "Tiêu cực", "down-high": "Tiêu cực, căng",
};

const SCOPE_COLOR: Record<MatrixScope, string> = { VNINDEX: GOLD, VN30: "#7cb4f5", UNIVERSE: "#c4b5fd" };
const SCOPE_VI: Record<MatrixScope, string> = { VNINDEX: "HOSE", VN30: "VN30", UNIVERSE: "Universe" };

/** Bản đồ trạng thái: X xu hướng và tham gia, Y căng thẳng. Đường là hành trình 20 phiên đến phiên đang xem. */
export function StateMap({ path, index, others = [] }: { path: StatePoint[]; index: number; others?: { scope: MatrixScope; x: number | null; y: number | null }[] }) {
  const W = 420, H = 214, L = 26, R = 10, T = 8, B = 22, LIM = 3;
  const sx = (v: number) => L + ((Math.max(-LIM, Math.min(LIM, v)) + LIM) / (2 * LIM)) * (W - L - R);
  const sy = (v: number) => T + ((LIM - Math.max(-LIM, Math.min(LIM, v))) / (2 * LIM)) * (H - T - B);
  const shown = path.slice(Math.max(0, index - 19), index + 1).filter((p) => ok(p.x) && ok(p.y));
  const cur = path[index];
  const d = shown.map((p, i) => `${i ? "L" : "M"}${sx(p.x as number).toFixed(1)},${sy(p.y as number).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" style={{ maxWidth: 520, margin: "0 auto" }} role="img" aria-label={`Bản đồ trạng thái, phiên ${cur?.date ?? ""}`} data-testid="mx-state-map">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} rx={6} fill="rgba(148,163,184,0.03)" stroke={GRID} />
      <rect x={sx(0)} y={T} width={W - R - sx(0)} height={sy(0) - T} fill="rgba(245,158,11,0.04)" />
      <rect x={L} y={T} width={sx(0) - L} height={sy(0) - T} fill="rgba(244,63,94,0.06)" />
      <rect x={sx(0)} y={sy(0)} width={W - R - sx(0)} height={H - B - sy(0)} fill="rgba(52,211,153,0.05)" />
      <line x1={sx(0)} x2={sx(0)} y1={T} y2={H - B} stroke={AXIS} />
      <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke={AXIS} />
      <text x={L + 6} y={T + 13} fontSize={11} fill={TXT}>Giảm, căng</text>
      <text x={W - R - 6} y={T + 13} fontSize={11} fill={TXT} textAnchor="end">Tăng, căng</text>
      <text x={L + 6} y={H - B - 6} fontSize={11} fill={TXT}>Giảm, yên</text>
      <text x={W - R - 6} y={H - B - 6} fontSize={11} fill={TXT} textAnchor="end">Tăng, yên</text>
      <text x={(L + W - R) / 2} y={H - 6} fontSize={11} fill={TXT} textAnchor="middle">Xu hướng và tham gia</text>
      <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} fontSize={11} fill={TXT} textAnchor="middle">Căng thẳng</text>
      {d && <path d={d} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.4} />}
      {shown.slice(0, -1).map((p, i) => <circle key={p.date} cx={sx(p.x as number)} cy={sy(p.y as number)} r={1.7} fill={GOLD} fillOpacity={0.25 + (0.5 * i) / Math.max(1, shown.length)}><title>{`${when(p.date)}: X ${vn(p.x, 2)}, Y ${vn(p.y, 2)}`}</title></circle>)}
      {others.filter((o) => ok(o.x) && ok(o.y)).map((o, i) => <g key={o.scope}><circle cx={sx(o.x as number)} cy={sy(o.y as number)} r={4.5} fill={SCOPE_COLOR[o.scope]} stroke="#0b1220" strokeWidth={1.2}><title>{SCOPE_VI[o.scope]}</title></circle><circle cx={W / 2 - 62 + i * 76} cy={T + 12} r={4} fill={SCOPE_COLOR[o.scope]} /><text x={W / 2 - 55 + i * 76} y={T + 16} fontSize={11} fill={INK} data-testid="mx-compare-legend">{SCOPE_VI[o.scope]}</text></g>)}
      {cur && ok(cur.x) && ok(cur.y) && <circle cx={sx(cur.x)} cy={sy(cur.y)} r={5.5} fill={GOLD} stroke="#0b1220" strokeWidth={1.5} data-testid="mx-state-dot"><title>{`${when(cur.date)}: X ${vn(cur.x, 2)}, Y ${vn(cur.y, 2)}`}</title></circle>}
    </svg>
  );
}

/** Cột dấu theo thời gian, cùng trục 0. Dùng cho dòng tiền. */
export function SignedBars({ rows, height = 92, unit = "%", digits = 2, label, testId }: { rows: { date: string; v: number | null }[]; height?: number; unit?: string; digits?: number; label: string; testId?: string }) {
  const W = 640, T = 6, B = 16, vals = rows.map((r) => r.v).filter(ok);
  const abs = vals.map(Math.abs).filter((v) => v > 0).sort((a, b) => a - b);
  const max = Math.max(1e-9, ...abs);
  // Chỉ khi có điểm đột biến mới chặn thang đo, để các cột còn lại đọc được; số thật vẫn ở chú thích.
  const q90 = abs[Math.floor(abs.length * 0.9)] ?? max;
  const scale = max > 2.5 * q90 ? Math.max(1e-9, 1.5 * q90) : max;
  const mid = T + (height - T - B) / 2, half = (height - T - B) / 2, bw = W / Math.max(1, rows.length);
  return (
    <figure className="min-w-0" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full h-auto" style={{ maxWidth: 900 }} role="img" aria-label={label}>
        <line x1={0} x2={W} y1={mid} y2={mid} stroke={AXIS} />
        {rows.map((r, i) => ok(r.v) && <rect key={r.date} x={i * bw + 1} y={r.v >= 0 ? mid - (Math.min(r.v, scale) / scale) * half : mid} width={Math.max(1.5, bw - 2)} height={Math.max(0.5, (Math.min(Math.abs(r.v), scale) / scale) * half)} rx={1} fill={r.v >= 0 ? UP : DOWN} fillOpacity={i === rows.length - 1 ? 1 : 0.65}><title>{`${when(r.date)}: ${sign(r.v, digits)}${unit}`}</title></rect>)}
      </svg>
      <figcaption className="text-[11px] text-slate-400">{label} · {when(rows[0]?.date)}–{when(rows[rows.length - 1]?.date)} · cao nhất {vn(max, digits)}{unit}</figcaption>
    </figure>
  );
}

export function Spark({ values, color = "#cbd5e1", w = 76, h = 22, zero = false }: { values: (number | null)[]; color?: string; w?: number; h?: number; zero?: boolean }) {
  const v = values.filter(ok);
  if (v.length < 2) return null;
  const lo = Math.min(...v, ...(zero ? [0] : [])), hi = Math.max(...v, ...(zero ? [0] : [])), span = hi - lo || 1;
  const pts = values.map((x, i) => (ok(x) ? `${(i / (values.length - 1)) * w},${h - 2 - ((x - lo) / span) * (h - 4)}` : null)).filter(Boolean).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">{zero && <line x1={0} x2={w} y1={h - 2 - ((0 - lo) / span) * (h - 4)} y2={h - 2 - ((0 - lo) / span) * (h - 4)} stroke={AXIS} />}<polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} /></svg>;
}

/** Thác nước điểm VN-Index: các trụ kéo, các trụ đè, phần còn lại, đến tổng điểm. */
export function buildWaterfall(items: ImpactItem[], top = 7, exactTotal?: number | null) {
  const up = [...items].filter((x) => x.points > 0).sort((a, b) => b.points - a.points).slice(0, top);
  const down = [...items].filter((x) => x.points < 0).sort((a, b) => a.points - b.points).slice(0, top);
  const shown = new Set([...up, ...down].map((x) => x.symbol));
  const shownSum = [...up, ...down].reduce((a, x) => a + x.points, 0);
  // Điểm từng mã đã làm tròn; có tổng chính xác thì phần còn lại lấy theo tổng đó để khớp dòng đối chiếu.
  const rest = exactTotal != null ? exactTotal - shownSum : items.filter((x) => !shown.has(x.symbol)).reduce((a, x) => a + x.points, 0);
  const bars: { key: string; label: string; v: number; from: number; to: number; ticker: boolean }[] = [];
  let run = 0;
  for (const x of [...up, ...down]) { bars.push({ key: x.symbol, label: x.symbol, v: x.points, from: run, to: run + x.points, ticker: true }); run += x.points; }
  bars.push({ key: "__rest", label: "Còn lại", v: rest, from: run, to: run + rest, ticker: false });
  run += rest;
  return { bars, total: run };
}

export function IndexWaterfall({ data, onSelect }: { data: IndexImpactDoc; onSelect: (t: string) => void }) {
  if (!data.items?.length) return null;
  const { bars, total } = buildWaterfall(data.items, 7, data.check?.predictedPoints);
  const W = 720, H = 190, L = 34, R = 8, T = 10, B = 28;
  const all = bars.flatMap((b) => [b.from, b.to]).concat(0, total);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const Y = (v: number) => T + ((hi - v) / span) * (H - T - B);
  const n = bars.length + 1, bw = (W - L - R) / n;
  const ticks = [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="overflow-x-auto" data-testid="mx-waterfall">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" style={{ minWidth: 720, maxWidth: 860, margin: "0 auto" }} role="img" aria-label={`Thác nước đóng góp vào VN-Index phiên ${data.date}, tổng ${vn(total, 2)} điểm`}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? AXIS : GRID} /><text x={L - 4} y={Y(v) + 3} fontSize={11} fill={TXT} textAnchor="end">{sign(v, 1)}</text></g>)}
        {bars.map((b, i) => {
          const x = L + i * bw, y = Y(Math.max(b.from, b.to)), h = Math.max(1, Math.abs(Y(b.from) - Y(b.to)));
          const body = <>
            <rect x={x + 2} y={y} width={bw - 4} height={h} rx={1.5} fill={b.v >= 0 ? UP : DOWN} fillOpacity={b.ticker ? 0.85 : 0.45}><title>{`${b.label}: ${sign(b.v)} điểm`}</title></rect>
            <text x={x + bw / 2} y={H - 15} fontSize={11} fill={b.ticker ? "#fcd34d" : TXT} textAnchor="middle">{b.label}</text>
            <text x={x + bw / 2} y={H - 3} fontSize={11} fill={TXT} textAnchor="middle">{sign(b.v, 2)}</text>
          </>;
          return b.ticker
            ? <g key={b.key} role="button" tabIndex={0} aria-label={`Chọn ${b.label}, ${sign(b.v)} điểm`} style={{ cursor: "pointer" }} data-testid={`mx-wf-${b.key}`} onClick={() => onSelect(b.label)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(b.label); } }}>{body}</g>
            : <g key={b.key}>{body}</g>;
        })}
        <rect x={L + bars.length * bw + 2} y={Y(Math.max(0, total))} width={bw - 4} height={Math.max(1, Math.abs(Y(0) - Y(total)))} rx={1.5} fill={GOLD} fillOpacity={0.8}><title>{`Tổng ${sign(total)} điểm`}</title></rect>
        <text x={L + bars.length * bw + bw / 2} y={H - 15} fontSize={11} fontWeight={700} fill={INK} textAnchor="middle">Tổng</text>
        <text x={L + bars.length * bw + bw / 2} y={H - 3} fontSize={11} fill={INK} textAnchor="middle">{sign(total, 2)}</text>
      </svg>
    </div>
  );
}

const CELL: Record<string, { fill: string; glyph: string; vi: string }> = {
  CONFIRMED: { fill: "#f59e0b", glyph: "◉", vi: "Đủ điều kiện" }, WATCH: { fill: "rgba(245,158,11,0.35)", glyph: "◎", vi: "Theo dõi" },
  INVALIDATED: { fill: "#f43f5e", glyph: "✕", vi: "Vô hiệu" }, COOLDOWN: { fill: "rgba(148,163,184,0.25)", glyph: "◌", vi: "Tạm nghỉ" }, INACTIVE: { fill: "rgba(148,163,184,0.07)", glyph: "○", vi: "Không hoạt động" },
};
/** Thanh trạng thái theo ngày cho từng kịch bản. */
export function ScenarioStrip({ rows, ids, names, testId }: { rows: Record<string, string | null>[]; ids: string[]; names: Record<string, string>; testId?: string }) {
  if (!rows.length) return null;
  const W = 720, L = 150, RH = 18, H = ids.length * RH + 18, bw = (W - L) / rows.length;
  return (
    <div data-testid={testId}>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" style={{ minWidth: 720, maxWidth: 860 }} role="img" aria-label={`Trạng thái kịch bản ${rows.length} phiên`}>
        {ids.map((id, r) => <g key={id}>
          <text x={0} y={r * RH + 12} fontSize={11} fill={INK}>{names[id]}</text>
          {rows.map((d, c) => { const st = CELL[d[id] ?? ""] ?? CELL.INACTIVE; return <rect key={String(d.date)} x={L + c * bw + 0.5} y={r * RH + 1} width={Math.max(1, bw - 1)} height={RH - 3} rx={1.5} fill={st.fill}><title>{`${names[id]} · ${when(String(d.date))}: ${st.vi}`}</title></rect>; })}
        </g>)}
        <text x={L} y={H - 3} fontSize={11} fill={TXT}>{when(String(rows[0].date))}</text>
        <text x={W} y={H - 3} fontSize={11} fill={TXT} textAnchor="end">{when(String(rows[rows.length - 1].date))}</text>
      </svg></div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400" aria-label="Chú giải">
        {(["CONFIRMED", "WATCH", "INVALIDATED", "COOLDOWN"] as const).map((k) => <li key={k} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CELL[k].fill }} />{CELL[k].vi}</li>)}
      </ul>
    </div>
  );
}
