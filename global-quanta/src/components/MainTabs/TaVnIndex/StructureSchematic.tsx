// Cấu trúc MTF v2 — SƠ ĐỒ CHU KỲ CHUẨN theo tài liệu gốc (ảnh DEMO "MA 1H/4H × Granville × Dow"): giảm → đáy W phá viền cổ [MỘT] →
// tăng → điều chỉnh về MA chân trên [B] tái tích lũy (điểm L) → tăng → đỉnh M / Sanzon [C] → thủng viền cổ [D] (điểm S) → giảm.
// Giai đoạn hiện tại được tô đậm. Dưới mỗi giai đoạn: lợi suất vượt trội TB 20 phiên NGOÀI MẪU của kiểm định MTF v2 (mô tả trung thực —
// kể cả khi trái với lời tài liệu).
import type { StructureStage, StructureStatPair } from "../../../hooks/useStructure";
import { STAGE_BAND, SK } from "./StructureSketch";

type Pt = [number, number];
// Toạ độ chuẩn hoá x 0..100, y 0 (thấp) .. 100 (cao).
const PRICE: Pt[] = [[0, 72], [4, 50], [8, 28], [12, 42], [16, 29], [20, 44], [26, 52], [31, 64], [37, 60], [43, 80], [48, 72], [52, 66], [56, 74], [62, 88],
  [66, 93], [69, 80], [72, 96], [75, 81], [78, 91], [81, 79], [86, 64], [89, 69], [94, 50], [100, 36]];
const MA: Pt[] = [[0, 82], [8, 62], [16, 46], [24, 44], [32, 52], [40, 60], [48, 66], [56, 72], [64, 80], [72, 84], [80, 84], [88, 76], [94, 66], [100, 56]];
const BANDS: { stage: StructureStage; x0: number; x1: number }[] = [
  { stage: "DOWN", x0: 0, x1: 7 }, { stage: "A", x0: 7, x1: 27 }, { stage: "UP", x0: 27, x1: 47 }, { stage: "B", x0: 47, x1: 55 },
  { stage: "UP", x0: 55, x1: 64 }, { stage: "C", x0: 64, x1: 83 }, { stage: "D", x0: 83, x1: 92 }, { stage: "DOWN", x0: 92, x1: 100 },
];
const W = 320, H = 196, PX = 10, TOP = 22, PH = 120;
const X = (x: number) => PX + (x / 100) * (W - 2 * PX);
const Y = (y: number) => TOP + ((100 - y) / 100) * PH;
const line = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join(" ");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2).replace(".", ",")}%`);

export default function StructureSchematic({ current, stats }: { current: StructureStage; stats?: Record<StructureStage, StructureStatPair> | null }) {
  const cur = current === "Bp" ? "DOWN" : current === "RANGE" ? null : current;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid="structure-schematic"
      aria-label={`Sơ đồ chu kỳ theo tài liệu — hiện tại ${STAGE_BAND[current].text}`}>
      {BANDS.map((b, k) => {
        const on = b.stage === cur, st = STAGE_BAND[b.stage];
        return (
          <g key={k} data-testid={on ? "structure-schematic-current" : undefined}>
            <rect x={X(b.x0)} y={TOP} width={X(b.x1) - X(b.x0)} height={PH} fill={st.fill} opacity={on ? 1 : 0.55} stroke={on ? (st.chip ?? "#94a3b8") : "none"} strokeWidth={on ? 1.2 : 0} />
            {st.chip && <>
              <rect x={(X(b.x0) + X(b.x1)) / 2 - 13} y={4} width={26} height={13} rx={3} fill={st.chip} opacity={on ? 1 : 0.6} />
              <text x={(X(b.x0) + X(b.x1)) / 2} y={13.5} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#fff">{st.text}</text>
            </>}
          </g>
        );
      })}
      <path d={line(MA)} fill="none" stroke={SK.slow} strokeWidth={1.6} />
      <path d={line(PRICE)} fill="none" stroke="#e2e8f0" strokeWidth={1.6} strokeLinejoin="round" />
      {/* viền cổ đáy W (MỘT) và đỉnh Sanzon (C) + điểm phá */}
      <line x1={X(10)} x2={X(28)} y1={Y(44)} y2={Y(44)} stroke={SK.bull} strokeDasharray="4 2" />
      <circle cx={X(21)} cy={Y(44)} r={3} fill="none" stroke={SK.bull} strokeWidth={1.3} />
      <line x1={X(67)} x2={X(86)} y1={Y(79.5)} y2={Y(79.5)} stroke={SK.bear} strokeDasharray="4 2" />
      <circle cx={X(82)} cy={Y(79.5)} r={3} fill="none" stroke={SK.bear} strokeWidth={1.3} />
      <text x={X(12)} y={Y(44) - 3} fontSize={6.5} fill="#6ee7b7">viền cổ đáy W</text>
      <text x={X(66)} y={Y(79.5) + 9} fontSize={6.5} fill="#fda4af">viền cổ Sanzon</text>
      {/* điểm vào cốt lõi: L khi khung nhỏ quay lại tăng tại MA (B), S khi thủng viền cổ (D) */}
      <path d={`M ${X(52)} ${Y(66) + 5} l -3.5 7 h 7 z`} fill={SK.ls} />
      <text x={X(52)} y={Y(66) + 21} textAnchor="middle" fontSize={8} fontWeight={800} fill={SK.ls}>L</text>
      <path d={`M ${X(86)} ${Y(64) - 5} l -3.5 -7 h 7 z`} fill={SK.ls} />
      <text x={X(86)} y={Y(64) - 15} textAnchor="middle" fontSize={8} fontWeight={800} fill={SK.ls}>S</text>
      {/* lợi suất lịch sử ngoài mẫu theo giai đoạn (kiểm định MTF v2) */}
      {stats && BANDS.filter((b, k) => BANDS.findIndex((o) => o.stage === b.stage) === k).map((b) => {
        const s = stats[b.stage]?.OOS;
        const v = s?.mean ?? null;
        const xs = BANDS.filter((o) => o.stage === b.stage);
        const cx = (X(xs[0].x0) + X(xs[0].x1)) / 2;
        return (
          <g key={`s${b.stage}`} data-testid="structure-schematic-stat">
            <text x={cx} y={TOP + PH + 12} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={v == null ? "#64748b" : v > 0 ? "#6ee7b7" : "#fda4af"}>{pct(v)}</text>
            <title>{`${STAGE_BAND[b.stage].text}: lợi suất vượt trội TB 20 phiên ngoài mẫu ${pct(v)}${s?.ci ? ` (KTC 95% ${s.ci.map((c) => pct(c)).join(" … ")})` : ""}, n = ${s?.n ?? 0}`}</title>
          </g>
        );
      })}
      <text x={PX} y={H - 22} fontSize={6.8} fill="#94a3b8">Đường trắng: giá · đỏ: MA chân trên (MA 4 giờ ở khung 1 giờ) · hồng: điểm vào cốt lõi L / S</text>
      <text x={PX} y={H - 12} fontSize={6.8} fill="#94a3b8">{stats ? "Số dưới mỗi giai đoạn: lợi suất vượt trội TB 20 phiên NGOÀI MẪU (2025–2026, VN100) — kiểm định MTF v2." : "Theo bộ ảnh + mtf_market_structure.py của tài liệu."}</text>
      <text x={PX} y={H - 2} fontSize={6.8} fill="#94a3b8">{stats ? "Mô tả lịch sử, không phải dự báo; có giai đoạn trái với lời tài liệu (B âm, quá đà dương)." : ""}</text>
    </svg>
  );
}
