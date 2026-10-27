import type { KeyboardEvent } from "react";
import type { GatewaySectorRrg } from "../../../../lib/locnganh/types";

type Props = {
  sectors: GatewaySectorRrg[];
  selectedSector?: string | null;
  onSelectSector?: (code: string) => void;
};

const W = 760;
const H = 410;
const ORIGIN = { x: 355, y: 270 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nfmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const correlationColor = (value: number) => {
  const t = clamp((value + 1) / 2, 0, 1);
  const a = [245, 158, 11], b = [34, 211, 238];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(",")})`;
};

/**
 * Lightweight, dependency-free 3D projection of the four observed RRG dimensions.
 * X/Y retain the canonical weekly JdK axes, depth is traded-value-share z-score,
 * and the fourth variable (market correlation) is encoded by color.
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

  const maxRrg = Math.max(1, ...eligible.flatMap((s) => [
    Math.abs(s.latestClosed.ratio - 100), Math.abs(s.latestClosed.momentum - 100),
  ]));
  const scale = Math.min(1, 2.6 / maxRrg);
  const points = eligible.map((sector) => {
    const rrg = sector.latestClosed;
    const x = clamp((rrg.ratio - 100) * scale, -2.6, 2.6);
    const y = clamp((rrg.momentum - 100) * scale, -2.6, 2.6);
    const z = clamp((sector.rrg4d!.flowShareZ ?? 0) / 3, -1, 1);
    const px = ORIGIN.x + x * 90 + z * 72;
    const py = ORIGIN.y - y * 66 - z * 48;
    return { sector, x, y, z, px, py };
  });

  const activateOnKey = (event: KeyboardEvent<SVGGElement>, code: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectSector?.(code);
    }
  };

  return <section data-testid="rrg4d-projection" aria-label="Bản đồ RRG 4D nghiên cứu">
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="rrg4d-title rrg4d-desc" style={{ display: "block", width: "100%", minWidth: 560, maxHeight: 430 }}>
        <title id="rrg4d-title">Bản đồ ngành RRG 4D</title>
        <desc id="rrg4d-desc">Trục ngang là RS-Ratio, trục đứng là RS-Momentum, chiều sâu là độ lệch thị phần giá trị giao dịch, màu sắc là tương quan lợi suất ngày với VN-Index.</desc>
        <line x1={ORIGIN.x - 235} y1={ORIGIN.y} x2={ORIGIN.x + 235} y2={ORIGIN.y} stroke="var(--ct-grid, #475569)" />
        <line x1={ORIGIN.x} y1={ORIGIN.y + 100} x2={ORIGIN.x} y2={ORIGIN.y - 180} stroke="var(--ct-grid, #475569)" />
        <line x1={ORIGIN.x - 72} y1={ORIGIN.y + 48} x2={ORIGIN.x + 72} y2={ORIGIN.y - 48} stroke="var(--ct-grid, #475569)" strokeDasharray="4 4" />
        <text x={ORIGIN.x + 205} y={ORIGIN.y + 18} fill="var(--text-tertiary)" fontSize="11">RS-Ratio →</text>
        <text x={ORIGIN.x + 8} y={ORIGIN.y - 165} fill="var(--text-tertiary)" fontSize="11">RS-Momentum ↑</text>
        <text x={ORIGIN.x + 77} y={ORIGIN.y - 53} fill="var(--text-tertiary)" fontSize="11">Thị phần GTGD z →</text>
        <text x={ORIGIN.x + 7} y={ORIGIN.y + 15} fill="var(--text-tertiary)" fontSize="10">100</text>
        {points.map(({ sector, x, y, z, px, py }) => {
          const corr = sector.rrg4d!.marketCorrelation60!;
          const active = selectedSector === sector.code;
          const radius = 5 + Math.min(6, Math.sqrt(sector.indexMembers));
          const label = `${sector.name}; RS-Ratio ${nfmt(sector.latestClosed.ratio)}; RS-Momentum ${nfmt(sector.latestClosed.momentum)}; thị phần GTGD z ${nfmt(sector.rrg4d!.flowShareZ)}; tương quan VN-Index ${nfmt(corr)}; n=${sector.rrg4d!.correlationObservations}`;
          return <g key={sector.code} data-testid={`rrg4d-sector-${sector.code}`} role={onSelectSector ? "button" : undefined} tabIndex={onSelectSector ? 0 : undefined}
            aria-label={label} aria-pressed={onSelectSector ? active : undefined}
            onClick={() => onSelectSector?.(sector.code)} onKeyDown={(event) => activateOnKey(event, sector.code)}
            style={{ cursor: onSelectSector ? "pointer" : undefined, opacity: selectedSector && !active ? 0.35 : 1 }}>
            <title>{label}</title>
            <circle cx={px} cy={py} r={radius} fill={correlationColor(corr)} stroke={active ? "#fff" : "#0f172a"} strokeWidth={active ? 3 : 1.5} />
            <text x={px + radius + 3} y={py + 3} fill="var(--text-secondary)" fontSize="10">{sector.name}</text>
            <text x={px + radius + 3} y={py + 15} fill="var(--text-tertiary)" fontSize="8">{nfmt(x, 1)}/{nfmt(y, 1)}/{nfmt(z * 3, 1)}</text>
          </g>;
        })}
      </svg>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
      <span>W / màu: tương quan ngày với VN-Index (60 phiên; tối thiểu 30)</span>
      <span style={{ color: correlationColor(-0.75) }}>−1 · ít đồng biến</span>
      <span style={{ color: correlationColor(0) }}>0 · ít tương quan tuyến tính</span>
      <span style={{ color: correlationColor(0.75) }}>+1 · đồng biến</span>
    </div>
    <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
      Mỗi điểm là snapshot tuần đã đóng; Z là z-score thị phần GTGD 20/60 so lịch sử 250 phiên. Màu chỉ mô tả tương quan, không phải độ an toàn hay tín hiệu mua.
    </p>
    <table className="sr-only" aria-label="Bảng dữ liệu bản đồ RRG 4D">
      <caption>Số liệu của các ngành đủ chất lượng để hiển thị trên bản đồ 4D</caption>
      <thead><tr><th>Ngành</th><th>RS-Ratio</th><th>RS-Momentum</th><th>Z thị phần GTGD</th><th>Tương quan VN-Index</th><th>Số phiên</th></tr></thead>
      <tbody>{points.map(({ sector }) => <tr key={sector.code}>
        <th scope="row">{sector.name}</th>
        <td>{nfmt(sector.latestClosed.ratio)}</td>
        <td>{nfmt(sector.latestClosed.momentum)}</td>
        <td>{nfmt(sector.rrg4d!.flowShareZ)}</td>
        <td>{nfmt(sector.rrg4d!.marketCorrelation60)}</td>
        <td>{sector.rrg4d!.correlationObservations}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}
