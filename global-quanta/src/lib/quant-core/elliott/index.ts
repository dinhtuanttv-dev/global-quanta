// Elliott Wave cho quant-core (Screener Engine v2 / S4): bọc engine GET (elliottGet.js) thành trạng thái dễ đọc —
// "đang sóng mấy", kịch bản chính + xác suất, mốc vô hiệu, các mức Fibonacci liên quan.
// Kết quả mang tính DIỄN GIẢI (INFERRED): bảng thống kê/trọng số của engine lấy từ sách, chưa hiệu chỉnh cho VN.
import { analyzeFull, invalidationOf, zigzag, type ElliottPivot, type ElliottScenario } from "./elliottGet.js";
import type { OhlcvBar } from "../../ta-command-center/types";

export type { ElliottPivot, ElliottScenario } from "./elliottGet.js";

export const ELLIOTT_BAR_LIMIT = 500;

export interface FibLevel { label: string; price: number }

export interface ElliottState {
  /** Ví dụ "Sóng 5 (tăng) đang hình thành", "Điều chỉnh B sau 5 sóng tăng". */
  label: string;
  wave: "3" | "4" | "5" | "A" | "B" | "C" | "post";
  dir: "up" | "down";
  probability: number | null;
  scenario: ElliottScenario;
  alternatives: { label: string; probability: number | null }[];
  invalidation: { price: number; side: "above" | "below"; reason: string } | null;
  levels: FibLevel[];
  /** Pivot đã xác nhận (ci ≠ null) + pivot cuối đang chạy. */
  pivots: ElliottPivot[];
  asOf: string;
}

const toCandles = (bars: OhlcvBar[]) => bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

/** Pivot zigzag chỉ dùng dữ liệu đến nến `t` (không nhìn trước): pivot toàn chuỗi có ci ≤ t. */
export function confirmedPivotsAt(pivots: ElliottPivot[], t: number): ElliottPivot[] {
  return pivots.filter((p) => p.ci != null && p.ci <= t);
}

export function pivotsOf(bars: OhlcvBar[], pct = 0.03): ElliottPivot[] {
  return zigzag(toCandles(bars), { pct });
}

function describe(sc: ElliottScenario, pivots: ElliottPivot[]): Pick<ElliottState, "label" | "wave"> {
  const dirText = sc.dir === "up" ? "tăng" : "giảm";
  if (sc.status === "wave5-forming") return { wave: "5", label: `Sóng 5 (${dirText}) đang hình thành` };
  // Chỉ đếm pivot ĐÃ XÁC NHẬN sau đỉnh/đáy sóng 5; chặng cuối (chưa xác nhận) là sóng đang chạy.
  const p5 = sc.points[5];
  const after = pivots.filter((p) => p.i > p5.i && p.ci != null).length;
  if (after === 0) return { wave: "A", label: `Sóng A điều chỉnh đang hình thành (sau 5 sóng ${dirText})` };
  if (after === 1) return { wave: "B", label: `Sóng B điều chỉnh đang hình thành (sau 5 sóng ${dirText})` };
  if (after === 2) return { wave: "C", label: `Sóng C điều chỉnh đang hình thành (sau 5 sóng ${dirText})` };
  return { wave: "post", label: `Đã qua điều chỉnh ABC sau 5 sóng ${dirText}` };
}

function levelsOf(sc: ElliottScenario): FibLevel[] {
  const out: FibLevel[] = [];
  if (sc.status === "wave5-forming") {
    for (const l of sc.targets.wave5.levels) out.push({ label: `Mục tiêu sóng 5 ×${l.ratio}`, price: l.price });
    out.push({ label: "Cửa sổ sóng 5: 62% của 0→3", price: sc.targets.wave5.window03.low });
    out.push({ label: "Cửa sổ sóng 5: 100% của 0→3", price: sc.targets.wave5.window03.high });
  } else {
    out.push({ label: "Mục tiêu đầu tiên của điều chỉnh (đáy/đỉnh sóng 4)", price: sc.points[4].price });
    const [p0, , , , , p5] = sc.points;
    const len = p5.price - p0.price;
    for (const r of [0.382, 0.5, 0.618]) out.push({ label: `Hồi ${(r * 100).toFixed(1).replace(".0", "")}% của 0→5`, price: p5.price - r * len });
  }
  return out;
}

/** Trạng thái Elliott tại nến cuối (500 nến gần nhất). null khi chưa đủ dữ liệu hoặc không có kịch bản hợp lệ. */
export function elliottState(bars: OhlcvBar[]): ElliottState | null {
  if (bars.length < 60) return null;
  const window = bars.slice(-ELLIOTT_BAR_LIMIT);
  const res = analyzeFull(toCandles(window), { pro: { topN: 3 } });
  const sc = res.scenarios[0] ?? res.best;
  if (!sc) return null;
  const d = describe(sc, res.pivots);
  const inv = invalidationOf(sc);
  return {
    ...d,
    dir: sc.dir,
    probability: sc.weight ?? null,
    scenario: sc,
    alternatives: res.scenarios.slice(1, 3).map((x) => ({ label: describe(x, res.pivots).label, probability: x.weight ?? null })),
    invalidation: inv ? { price: inv.price, side: inv.side, reason: inv.reason } : null,
    levels: levelsOf(sc),
    pivots: res.pivots,
    asOf: window[window.length - 1].date,
  };
}
