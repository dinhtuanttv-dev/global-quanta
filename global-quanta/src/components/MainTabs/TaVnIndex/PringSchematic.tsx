// Pattern Scanner v2 — SƠ ĐỒ MẪU CHUẨN theo sách Martin Pring (kiểu Hình 7-1/7-2 vai-đầu-vai, 8-2 đáy đôi, ch9 tam giác…):
// đường giá lý tưởng, biên / viền cổ, điểm phá vỡ, mục tiêu đo theo chiều cao (log), mức thất bại, khối lượng mẫu
// (co lại khi hình thành, mở rộng khi phá vỡ lên — ch6). Mô hình giảm = lật dọc mô hình tăng tương ứng.
import type { PatternDir } from "../../../hooks/usePatterns";

type Pt = [number, number];
interface Shape { path: Pt[]; lines: [Pt, Pt][]; breakAt: Pt; labels?: [Pt, string][]; chapter: string; vol: number[] }

// Toạ độ chuẩn hoá: x 0..100, y 0 (thấp) .. 100 (cao), cho phiên bản TĂNG (đáy). Bản giảm lật y.
const SHAPES: Record<string, Shape> = {
  HS: { chapter: "ch7 · Hình 7-1/7-2", path: [[0, 80], [12, 50], [20, 62], [32, 22], [44, 62], [56, 48], [66, 62], [74, 70], [80, 62], [92, 92]], lines: [[[16, 62], [80, 62]]], breakAt: [74, 62],
    labels: [[[12, 50], "Vai trái"], [[32, 22], "Đầu"], [[56, 48], "Vai phải"], [[44, 66], "Viền cổ"]], vol: [6, 5, 4, 5, 3, 2, 3, 9, 6, 7] },
  DOUBLE: { chapter: "ch8 · Hình 8-2", path: [[0, 85], [20, 30], [40, 62], [60, 31], [72, 62], [80, 70], [86, 62], [100, 92]], lines: [[[40, 62], [86, 62]]], breakAt: [72, 62],
    labels: [[[20, 30], "Đáy 1"], [[60, 31], "Đáy 2"], [[40, 66], "Đỉnh hồi"]], vol: [7, 6, 4, 3, 3, 9, 6, 7] },
  TRIPLE: { chapter: "ch8", path: [[0, 85], [14, 32], [28, 60], [44, 31], [58, 60], [72, 32], [82, 60], [88, 68], [100, 92]], lines: [[[28, 60], [88, 60]]], breakAt: [82, 60],
    labels: [[[14, 32], "Đáy 1"], [[44, 31], "Đáy 2"], [[72, 32], "Đáy 3"]], vol: [7, 6, 5, 4, 3, 3, 9, 7] },
  RECT: { chapter: "ch9", path: [[0, 20], [12, 66], [24, 38], [38, 66], [52, 38], [66, 66], [76, 42], [84, 66], [100, 92]], lines: [[[10, 66], [84, 66]], [[10, 38], [84, 38]]], breakAt: [84, 66], vol: [7, 5, 4, 4, 3, 3, 9, 7] },
  ASC: { chapter: "ch9", path: [[0, 20], [14, 66], [26, 30], [40, 66], [52, 44], [64, 66], [72, 54], [78, 66], [100, 92]], lines: [[[12, 66], [82, 66]], [[26, 30], [80, 62]]], breakAt: [78, 66], vol: [7, 5, 4, 4, 3, 3, 9, 7] },
  SYM: { chapter: "ch9 · phá vỡ ở ½–⅔ đường tới đỉnh", path: [[0, 20], [12, 78], [26, 30], [40, 70], [52, 40], [62, 62], [70, 48], [76, 60], [100, 92]], lines: [[[12, 78], [88, 54]], [[26, 30], [88, 52]]], breakAt: [74, 61], vol: [7, 6, 5, 4, 3, 3, 9, 7] },
  WEDGE_FALL: { chapter: "ch11", path: [[0, 92], [14, 50], [24, 72], [40, 40], [50, 58], [64, 34], [72, 46], [80, 40], [100, 80]], lines: [[[0, 92], [84, 40]], [[14, 50], [84, 30]]], breakAt: [76, 48], vol: [6, 5, 4, 4, 3, 3, 8, 7] },
  BROAD: { chapter: "ch10 · hiếm", path: [[0, 40], [12, 56], [22, 44], [36, 66], [50, 34], [66, 76], [76, 26], [88, 86], [100, 98]], lines: [[[12, 56], [88, 84]], [[22, 44], [76, 26]]], breakAt: [86, 82], vol: [4, 5, 5, 6, 6, 7, 8, 9] },
  FLAG: { chapter: "ch12 · ≤ 4 tuần", path: [[0, 10], [26, 70], [34, 62], [40, 66], [48, 56], [54, 60], [60, 52], [66, 62], [90, 96]], lines: [[[26, 72], [64, 60]], [[32, 62], [64, 50]], [[0, 10], [26, 70]]], breakAt: [64, 59],
    labels: [[[10, 36], "Cột cờ"]], vol: [6, 9, 9, 4, 3, 3, 2, 9, 7] },
  PENNANT: { chapter: "ch12", path: [[0, 10], [26, 70], [34, 56], [42, 66], [50, 58], [56, 63], [62, 60], [90, 96]], lines: [[[26, 72], [64, 62]], [[32, 54], [64, 59]], [[0, 10], [26, 70]]], breakAt: [62, 61], vol: [6, 9, 9, 4, 3, 2, 9, 7] },
  ROUND: { chapter: "ch11", path: [[0, 80], [10, 60], [22, 42], [36, 30], [50, 26], [64, 30], [76, 42], [86, 60], [92, 80], [100, 94]], lines: [[[0, 80], [92, 80]]], breakAt: [92, 80], vol: [6, 5, 4, 3, 2, 2, 3, 4, 6, 8] },
  CUP: { chapter: "ch11 · cốc và tay cầm", path: [[0, 82], [10, 60], [24, 36], [40, 30], [56, 38], [70, 62], [78, 80], [84, 70], [90, 76], [94, 82], [100, 96]], lines: [[[0, 82], [94, 82]]], breakAt: [94, 82],
    labels: [[[40, 30], "Cốc"], [[84, 70], "Tay cầm"]], vol: [6, 5, 4, 3, 3, 4, 5, 2, 2, 8, 7] },
  ISLAND: { chapter: "ch5 · khoảng trống", path: [[0, 90], [24, 50], [30, 30], [40, 26], [50, 30], [56, 52], [100, 90]], lines: [[[22, 46], [58, 46]]], breakAt: [56, 52], labels: [[[40, 22], "Đảo"]], vol: [5, 8, 4, 3, 4, 9, 6] },
};

function shapeKey(type: string): { key: string; flip: boolean } {
  const t = type.toUpperCase();
  if (t.startsWith("HS_")) return { key: "HS", flip: t === "HS_TOP" || t === "HS_CONT_DOWN" };
  if (t.startsWith("DOUBLE")) return { key: "DOUBLE", flip: t === "DOUBLE_TOP" };
  if (t.startsWith("TRIPLE")) return { key: "TRIPLE", flip: t === "TRIPLE_TOP" };
  if (t === "ASC_TRIANGLE") return { key: "ASC", flip: false };
  if (t === "DESC_TRIANGLE") return { key: "ASC", flip: true }; // tam giác giảm = lật tam giác tăng
  if (t === "SYM_TRIANGLE") return { key: "SYM", flip: false };
  if (t === "RECTANGLE") return { key: "RECT", flip: false };
  if (t === "FALLING_WEDGE") return { key: "WEDGE_FALL", flip: false };
  if (t === "RISING_WEDGE") return { key: "WEDGE_FALL", flip: true };
  if (t.startsWith("BROAD")) return { key: "BROAD", flip: false };
  if (t === "FLAG") return { key: "FLAG", flip: false };
  if (t === "PENNANT") return { key: "PENNANT", flip: false };
  if (t === "CUP_HANDLE") return { key: "CUP", flip: false };
  if (t.startsWith("ROUNDING")) return { key: "ROUND", flip: t === "ROUNDING_TOP" };
  if (t.startsWith("ISLAND")) return { key: "ISLAND", flip: t === "ISLAND_TOP" };
  return { key: "RECT", flip: false };
}

const W = 300, H = 170, PX = 14, TOP = 10, PH = 108, VT = 128, VH = 30;

export default function PringSchematic({ type, dir, label }: { type: string; dir: PatternDir; label: string }) {
  const { key, flip: baseFlip } = shapeKey(type);
  const sh = SHAPES[key];
  // tam giác cân / chữ nhật / mở rộng / cờ là hai chiều: hướng theo mô hình thực tế; các dạng đảo chiều đã có hướng trong `type`
  const twoWay = ["SYM", "RECT", "BROAD", "FLAG", "PENNANT"].includes(key);
  const flip = twoWay ? dir === "bear" : baseFlip;
  const X = (x: number) => PX + (x / 100) * (W - 2 * PX);
  const Y = (y: number) => TOP + ((100 - (flip ? 100 - y : y)) / 100) * PH;
  const d = sh.path.map(([x, y], i) => `${i ? "L" : "M"} ${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join(" ");
  const [bx, by] = sh.breakAt;
  const lowY = Math.min(...sh.path.slice(0, -1).map((p) => p[1])), height = by - lowY;
  const tgt = Math.min(100, by + height);
  const fail = by - height / 2;
  const up = !flip;
  const vMax = Math.max(...sh.vol), vw = (W - 2 * PX) / sh.vol.length;
  const boBar = Math.min(sh.vol.length - 1, Math.round((bx / 100) * (sh.vol.length - 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Sơ đồ mẫu ${label} theo Pring (${sh.chapter})`} data-testid="pring-schematic">
      {sh.lines.map(([a, b], i) => <line key={i} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#94a3b8" strokeWidth={1} strokeDasharray={i === sh.lines.length - 1 && key.startsWith("FLAG") ? "3 2" : undefined} />)}
      <path d={d} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={X(bx)} cy={Y(by)} r={3} fill="#f59e0b" />
      <text x={X(bx) + 5} y={Y(by) + (up ? 10 : -4)} fontSize={7.5} fill="#fbbf24">Phá vỡ · giữ 2 thanh</text>
      {/* mục tiêu tối thiểu = chiều cao mô hình chiếu từ điểm phá vỡ (thang log) */}
      <line x1={X(bx) - 4} x2={X(bx) - 4} y1={Y(by)} y2={Y(tgt)} stroke={up ? "#34d399" : "#fb7185"} strokeDasharray="2 2" markerEnd="url(#arr)" />
      <line x1={X(bx) - 8} x2={X(100)} y1={Y(tgt)} y2={Y(tgt)} stroke={up ? "#34d399" : "#fb7185"} strokeDasharray="2 3" opacity={0.6} />
      <text x={X(100)} y={Y(tgt) + (up ? -3 : 9)} textAnchor="end" fontSize={7} fill={up ? "#6ee7b7" : "#fda4af"}>Mục tiêu 1× chiều cao</text>
      <line x1={X(0)} x2={X(100)} y1={Y(fail)} y2={Y(fail)} stroke="#f43f5e" strokeDasharray="4 3" opacity={0.5} />
      <text x={X(0)} y={Y(fail) + (up ? 9 : -3)} fontSize={7} fill="#fda4af">Thất bại khi quay lại 50%</text>
      {sh.labels?.map(([[x, y], t]) => <text key={t} x={X(x)} y={Y(y) + (up ? 10 : -5)} textAnchor="middle" fontSize={7} fill="#e2e8f0">{t}</text>)}
      <defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#94a3b8" /></marker></defs>
      {sh.vol.map((v, i) => <rect key={i} x={PX + i * vw + vw * 0.2} y={VT + VH - (v / vMax) * VH} width={vw * 0.6} height={(v / vMax) * VH} fill={i === boBar ? "#f59e0b" : "rgba(148,163,184,0.35)"} />)}
      <text x={PX} y={VT - 2} fontSize={7} fill="#64748b">Khối lượng mẫu: co lại khi hình thành, mở rộng khi phá vỡ{up ? " lên" : ""} · {sh.chapter}</text>
    </svg>
  );
}
