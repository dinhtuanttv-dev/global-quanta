import type { KeyboardEvent } from "react";
import type { GatewaySectorRrg } from "../../../../lib/locnganh/types";

type Props = {
  sectors: GatewaySectorRrg[];
  selectedSector?: string | null;
  onSelectSector?: (code: string) => void;
};

const W = 1120;
const H = 580;
const PLOT = { left: 110, right: 1010, top: 105, bottom: 465 };
const ORIGIN = { x: 560, y: 290 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nfmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const correlationColor = (value: number) => {
  const t = clamp((value + 1) / 2, 0, 1);
  const a = [245, 158, 11], b = [34, 211, 238];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(",")})`;
};

type ProjectedPoint = {
  sector: GatewaySectorRrg;
  dx: number;
  dy: number;
  z: number;
  px: number;
  py: number;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "end";
};

/**
 * Responsive isometric view of four observed dimensions. RS-Ratio and RS-Momentum
 * remain the canonical RRG axes; traded-value-share z-score is the projected depth;
 * market correlation to VNINDEX is color only. No trade score is encoded.
 */
export default function RRG4DProjection({ sectors, selectedSector, onSelectSector }: Props) {
  const eligible = sectors.filter((s) =>
    s.rrg4d?.correlationStatus === "ready"
    && s.rrg4d.flowShareZ != null
    && s.rrg4d.marketCorrelation60 != null
    && Number.isFinite(s.latestClosed.ratio)
    && Number.isFinite(s.latestClosed.momentum)
  );
  if (!eligible.length) {
    return <div data-testid="rrg4d-insufficient" role="status" style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 11 }}>
      Chưa đủ lịch sử đồng bộ để dựng bản đồ 4D. Cần tối thiểu 30 phiên ghép cặp cho tương quan; không tạo dữ liệu thay thế.
    </div>;
  }

  // Fit the observed RRG range to the plot while keeping equal units on X/Y.
  // The prior fixed 1x scale left ordinary observations clustered at the origin.
  const maxDeviation = Math.max(0.6, ...eligible.flatMap((s) => [
    Math.abs(s.latestClosed.ratio - 100), Math.abs(s.latestClosed.momentum - 100),
  ]));
  const xyScale = Math.min((PLOT.right - PLOT.left) * 0.28, (PLOT.bottom - PLOT.top) * 0.46) / maxDeviation;
  const rawPoints = eligible.map((sector) => {
    const dx = sector.latestClosed.ratio - 100;
    const dy = sector.latestClosed.momentum - 100;
    const z = clamp(sector.rrg4d!.flowShareZ!, -3, 3);
    // A fixed isometric depth vector makes Z visible without changing the canonical X/Y values.
    const px = ORIGIN.x + dx * xyScale + z * 26;
    const py = ORIGIN.y - dy * xyScale - z * 20;
    return { sector, dx, dy, z, px, py };
  });

  // Direct labels collided in the previous view. Route them into left/right label rails,
  // with deterministic vertical spacing and leader lines back to the true point.
  const labelPoints: ProjectedPoint[] = rawPoints.map((point) => ({
    ...point,
    labelX: point.px < ORIGIN.x ? 76 : 1044,
    labelY: clamp(point.py, PLOT.top + 14, PLOT.bottom - 8),
    labelAnchor: point.px < ORIGIN.x ? "end" : "start",
  }));
  for (const side of ["left", "right"] as const) {
    const group = labelPoints.filter((point) => (side === "left") === (point.labelAnchor === "end"));
    group.sort((a, b) => a.py - b.py || a.sector.code.localeCompare(b.sector.code));
    const gap = 24;
    for (let i = 1; i < group.length; i++) group[i].labelY = Math.max(group[i].labelY, group[i - 1].labelY + gap);
    const overflow = group.length ? group[group.length - 1].labelY - (PLOT.bottom - 8) : 0;
    if (overflow > 0) for (const point of group) point.labelY -= overflow;
    for (let i = group.length - 2; i >= 0; i--) group[i].labelY = Math.min(group[i].labelY, group[i + 1].labelY - gap);
    const underflow = group.length ? PLOT.top + 14 - group[0].labelY : 0;
    if (underflow > 0) for (const point of group) point.labelY += underflow;
  }

  const activateOnKey = (event: KeyboardEvent<SVGGElement>, code: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectSector?.(code);
    }
  };
  const handleSelect = (code: string) => onSelectSector?.(code);

  return <section data-testid="rrg4d-projection" aria-label="Bản đồ RRG 4D nghiên cứu" style={{ width: "100%" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", padding: "8px 10px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, fontSize: 10, color: "var(--text-secondary)" }}>
      <span><b>X</b> RS-Ratio − 100</span>
      <span><b>Y</b> RS-Momentum − 100</span>
      <span><b>Z</b> lệch chuẩn thị phần GTGD (σ)</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><b>W / màu</b><i aria-hidden="true" style={{ display: "inline-block", width: 92, height: 7, borderRadius: 8, background: `linear-gradient(90deg, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})` }} />−1 nghịch chiều · 0 ít tương quan tuyến tính · +1 đồng biến mạnh</span>
      <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{eligible.length}/{sectors.length} ngành đủ chất lượng · điểm tròn cùng kích thước</span>
    </div>

    <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--bg-surface-2)", borderRadius: 10, background: "radial-gradient(ellipse at 50% 49%, rgba(14,165,233,.075), transparent 64%)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="rrg4d-title rrg4d-desc" style={{ display: "block", width: "100%", minWidth: 760, height: "auto" }}>
        <title id="rrg4d-title">Bản đồ ngành RRG 4D</title>
        <desc id="rrg4d-desc">Trục ngang và dọc là độ lệch RS-Ratio và RS-Momentum so với 100. Độ sâu chéo là z-score thị phần giá trị giao dịch. Màu biểu thị tương quan lợi suất ngày với VNINDEX. Nhãn được tách khỏi điểm để không chồng lấn.</desc>
        <defs>
          <linearGradient id="rrg4d-depth" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#64748b" stopOpacity=".02"/><stop offset="100%" stopColor="#38bdf8" stopOpacity=".16"/></linearGradient>
        </defs>
        <rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.bottom - PLOT.top} rx="10" fill="url(#rrg4d-depth)" stroke="rgba(100,116,139,.18)" />
        <rect x={ORIGIN.x} y={PLOT.top} width={PLOT.right - ORIGIN.x} height={ORIGIN.y - PLOT.top} fill="rgba(34,197,94,.035)" />
        <rect x={PLOT.left} y={PLOT.top} width={ORIGIN.x - PLOT.left} height={ORIGIN.y - PLOT.top} fill="rgba(56,189,248,.035)" />
        <rect x={PLOT.left} y={ORIGIN.y} width={ORIGIN.x - PLOT.left} height={PLOT.bottom - ORIGIN.y} fill="rgba(245,158,11,.035)" />
        <rect x={ORIGIN.x} y={ORIGIN.y} width={PLOT.right - ORIGIN.x} height={PLOT.bottom - ORIGIN.y} fill="rgba(148,163,184,.025)" />

        {[0.5, 1].map((fraction) => <g key={fraction} aria-hidden="true">
          <line x1={ORIGIN.x - (ORIGIN.x - PLOT.left) * fraction} y1={PLOT.top} x2={ORIGIN.x - (ORIGIN.x - PLOT.left) * fraction} y2={PLOT.bottom} stroke="rgba(100,116,139,.18)" strokeDasharray="3 6" />
          <line x1={ORIGIN.x + (PLOT.right - ORIGIN.x) * fraction} y1={PLOT.top} x2={ORIGIN.x + (PLOT.right - ORIGIN.x) * fraction} y2={PLOT.bottom} stroke="rgba(100,116,139,.18)" strokeDasharray="3 6" />
          <line x1={PLOT.left} y1={ORIGIN.y - (ORIGIN.y - PLOT.top) * fraction} x2={PLOT.right} y2={ORIGIN.y - (ORIGIN.y - PLOT.top) * fraction} stroke="rgba(100,116,139,.18)" strokeDasharray="3 6" />
          <line x1={PLOT.left} y1={ORIGIN.y + (PLOT.bottom - ORIGIN.y) * fraction} x2={PLOT.right} y2={ORIGIN.y + (PLOT.bottom - ORIGIN.y) * fraction} stroke="rgba(100,116,139,.18)" strokeDasharray="3 6" />
        </g>)}

        <line x1={PLOT.left} y1={ORIGIN.y} x2={PLOT.right} y2={ORIGIN.y} stroke="#94a3b8" strokeOpacity=".75" strokeWidth="1.2" />
        <line x1={ORIGIN.x} y1={PLOT.bottom} x2={ORIGIN.x} y2={PLOT.top} stroke="#94a3b8" strokeOpacity=".75" strokeWidth="1.2" />
        <line x1={ORIGIN.x - 78} y1={ORIGIN.y + 60} x2={ORIGIN.x + 78} y2={ORIGIN.y - 60} stroke="#38bdf8" strokeOpacity=".75" strokeWidth="2" />
        <text x={PLOT.left + 12} y={PLOT.top + 20} fill="#7dd3fc" fontSize="11" fontWeight="700">IMPROVING · RS yếu đi, momentum hồi phục</text>
        <text x={PLOT.right - 12} y={PLOT.top + 20} textAnchor="end" fill="#4ade80" fontSize="11" fontWeight="700">LEADING · RS và momentum mạnh</text>
        <text x={PLOT.left + 12} y={PLOT.bottom - 12} fill="#fbbf24" fontSize="11" fontWeight="700">LAGGING · RS và momentum yếu</text>
        <text x={PLOT.right - 12} y={PLOT.bottom - 12} textAnchor="end" fill="#cbd5e1" fontSize="11" fontWeight="700">WEAKENING · RS mạnh, momentum giảm</text>

        {[-1, 0, 1].map((tick) => <g key={`x${tick}`} aria-hidden="true">
          <line x1={ORIGIN.x + tick * xyScale} y1={ORIGIN.y - 5} x2={ORIGIN.x + tick * xyScale} y2={ORIGIN.y + 5} stroke="#cbd5e1" />
          <text x={ORIGIN.x + tick * xyScale} y={ORIGIN.y + 19} textAnchor="middle" fill="var(--text-tertiary)" fontSize="9">{tick > 0 ? "+" : ""}{tick}</text>
          <line x1={ORIGIN.x - 5} y1={ORIGIN.y - tick * xyScale} x2={ORIGIN.x + 5} y2={ORIGIN.y - tick * xyScale} stroke="#cbd5e1" />
          <text x={ORIGIN.x + 9} y={ORIGIN.y - tick * xyScale - 4} fill="var(--text-tertiary)" fontSize="9">{tick > 0 ? "+" : ""}{tick}</text>
        </g>)}
        <text x={PLOT.right - 10} y={ORIGIN.y + 35} textAnchor="end" fill="var(--text-secondary)" fontSize="11" fontWeight="700">RS-Ratio lệch khỏi 100 →</text>
        <text x={ORIGIN.x + 12} y={PLOT.top + 38} fill="var(--text-secondary)" fontSize="11" fontWeight="700">RS-Momentum lệch khỏi 100 ↑</text>
        <text x={ORIGIN.x + 88} y={ORIGIN.y - 67} fill="#7dd3fc" fontSize="10" fontWeight="700">Z thị phần GTGD</text>

        {labelPoints.map((point) => {
          const { sector, px, py, labelX, labelY, labelAnchor } = point;
          const corr = sector.rrg4d!.marketCorrelation60!;
          const active = selectedSector === sector.code;
          const leaderEndX = labelAnchor === "start" ? labelX - 7 : labelX + 7;
          const label = `${sector.name}; RS-Ratio ${nfmt(sector.latestClosed.ratio)}; RS-Momentum ${nfmt(sector.latestClosed.momentum)}; thị phần GTGD z ${nfmt(sector.rrg4d!.flowShareZ)}; tương quan VNINDEX ${nfmt(corr)}; n=${sector.rrg4d!.correlationObservations}`;
          return <g key={sector.code} data-testid={`rrg4d-sector-${sector.code}`} role={onSelectSector ? "button" : undefined} tabIndex={onSelectSector ? 0 : undefined}
            aria-label={label} aria-pressed={onSelectSector ? active : undefined}
            onClick={() => handleSelect(sector.code)} onKeyDown={(event) => activateOnKey(event, sector.code)}
            style={{ cursor: onSelectSector ? "pointer" : undefined, opacity: selectedSector && !active ? 0.3 : 1 }}>
            <title>{label}</title>
            <line x1={px} y1={py} x2={leaderEndX} y2={labelY - 2} stroke={active ? "#fff" : "#64748b"} strokeOpacity=".6" strokeWidth=".8" />
            <circle cx={px} cy={py} r={active ? 8 : 6} fill={correlationColor(corr)} stroke={active ? "#fff" : "#0f172a"} strokeWidth={active ? 2.5 : 1.5} />
            <circle cx={px} cy={py} r="10" fill="transparent" stroke={active ? "#fff" : "transparent"} strokeWidth="1" />
            <text x={labelX} y={labelY} textAnchor={labelAnchor} fill={active ? "#fff" : "var(--text-primary)"} fontSize="11" fontWeight={active ? "800" : "650"} paintOrder="stroke" stroke="var(--bg-surface-1, #0b1220)" strokeWidth="4" strokeLinejoin="round">{sector.name}</text>
          </g>;
        })}
        <text x={W / 2} y={H - 15} textAnchor="middle" fill="var(--text-tertiary)" fontSize="10">Vị trí điểm = snapshot tuần đã đóng · chiều sâu Z dùng trục chiếu chéo · màu W là tương quan 60 phiên</text>
      </svg>
    </div>

    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table data-testid="rrg4d-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 680 }}>
        <caption style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-secondary)", fontWeight: 700 }}>Giá trị chính xác của các chiều RRG 4D · chọn ngành để đồng bộ vùng phân tích</caption>
        <thead><tr style={{ color: "var(--text-tertiary)", textAlign: "left" }}>
          <th scope="col" style={{ padding: 6 }}>Ngành</th><th scope="col" style={{ padding: 6 }}>RS-Ratio</th><th scope="col" style={{ padding: 6 }}>RS-Momentum</th><th scope="col" style={{ padding: 6 }}>Z thị phần GTGD</th><th scope="col" style={{ padding: 6 }}>ρ với VNINDEX</th><th scope="col" style={{ padding: 6 }}>n phiên</th>
        </tr></thead>
        <tbody>{labelPoints.map(({ sector }) => {
          const active = selectedSector === sector.code;
          return <tr key={sector.code} data-testid={`rrg4d-row-${sector.code}`} style={{ borderTop: "1px solid var(--bg-surface-2)", background: active ? "rgba(56,189,248,.08)" : undefined }}>
            <th scope="row" style={{ padding: 5, textAlign: "left" }}><button type="button" onClick={() => handleSelect(sector.code)} aria-pressed={onSelectSector ? active : undefined} style={{ border: 0, padding: 0, background: "transparent", color: "var(--text-primary)", cursor: onSelectSector ? "pointer" : "default", font: "inherit", textAlign: "left" }}>{sector.name}</button></th>
            <td style={{ padding: 5 }}>{nfmt(sector.latestClosed.ratio)}</td><td style={{ padding: 5 }}>{nfmt(sector.latestClosed.momentum)}</td><td style={{ padding: 5 }}>{nfmt(sector.rrg4d!.flowShareZ)}</td>
            <td style={{ padding: 5, color: correlationColor(sector.rrg4d!.marketCorrelation60!) }}>{nfmt(sector.rrg4d!.marketCorrelation60)}</td><td style={{ padding: 5 }}>{sector.rrg4d!.correlationObservations}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "7px 0 0" }}>
      Z là z-score thị phần GTGD so lịch sử 250 phiên. Màu chỉ mô tả tương quan, không phải độ an toàn hay tín hiệu mua; dữ liệu tương quan thiếu mẫu sẽ không được vẽ.
    </p>
  </section>;
}
