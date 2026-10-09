// Elliott Wave cho quant-core (Screener Engine v2 / S4): bọc engine GET (elliottGet.js) thành trạng thái dễ đọc —
// "đang sóng mấy", kịch bản chính + xác suất, mốc vô hiệu, các mức Fibonacci liên quan.
// Kết quả mang tính DIỄN GIẢI (INFERRED): trọng số kịch bản dùng bảng tỷ lệ sóng của VN (E4, vnValidation.ts) nhưng
// không tín hiệu nào có lợi thế lợi suất ngoài mẫu — chỉ để đối chiếu với sách.
import { analyzeFull, invalidationOf, zigzag, type ElliottPivot, type ElliottScenario } from "./elliottGet.js";
import { ELLIOTT_VN_TABLES } from "./vnValidation";
import type { OhlcvBar } from "../../ta-command-center/types";

export type { ElliottPivot, ElliottScenario } from "./elliottGet.js";

export const ELLIOTT_BAR_LIMIT = 500;

export interface FibLevel { label: string; price: number }

export interface ElliottState {
  /** Ví dụ "Sóng 5 (tăng) đang hình thành", "Điều chỉnh B sau 5 sóng tăng". */
  label: string;
  wave: "3" | "4" | "5" | "A" | "B" | "C" | "post" | "none";
  dir: "up" | "down" | null;
  /** Bậc sóng của kịch bản (nhỏ/trung/lớn/chính — zigzag 1,5% … 12%). */
  degree: string | null;
  /** Trọng số TƯƠNG ĐỐI của kịch bản so với các kịch bản khác (softmax điểm mô hình từ bảng tỷ lệ sóng VN + trọng số
   *  tự đặt) — KHÔNG phải xác suất xảy ra. */
  weight: number | null;
  scenario: ElliottScenario | null;
  alternatives: { label: string; weight: number | null }[];
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

const DEGREE_VI: Record<string, string> = { minor: "bậc nhỏ", intermediate: "bậc trung", major: "bậc lớn", primary: "bậc chính" };

type Scenario = ElliottScenario & { degree?: string; pivotsAfter?: number };
interface LiveSignal { type: string; dir?: "up" | "down"; targets?: { ratio: number; price: number }[]; wave4Zones?: { ratio: number; price: number }[] }

function describe(sc: Scenario, pivots: ElliottPivot[]): Pick<ElliottState, "label" | "wave"> {
  const r = describeRaw(sc, pivots);
  const deg = sc.degree ? DEGREE_VI[sc.degree] ?? sc.degree : null;
  return { ...r, label: deg ? `${r.label} · ${deg}` : r.label };
}

function describeRaw(sc: Scenario, pivots: ElliottPivot[]): Pick<ElliottState, "label" | "wave"> {
  const dirText = sc.dir === "up" ? "tăng" : "giảm";
  if (sc.status === "wave5-forming") return { wave: "5", label: `Sóng 5 (${dirText}) đang hình thành` };
  // Đỉnh/đáy sóng 5 chưa xác nhận (pivot cuối đang chạy) -> vẫn đang trong sóng 5.
  const p5 = sc.points[5];
  if (!p5.confirmed) return { wave: "5", label: `Sóng 5 (${dirText}) đang chạy — chưa xác nhận ${sc.dir === "up" ? "đỉnh" : "đáy"}` };
  // Chỉ đếm pivot ĐÃ XÁC NHẬN sau đỉnh/đáy sóng 5; chặng cuối (chưa xác nhận) là sóng đang chạy.
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
    // T-43; trên VN chỉ 23,6% sóng 5 kết thúc trong cửa sổ này (E4) — nhãn ghi "sách".
    out.push({ label: "Cửa sổ sóng 5 (sách): 62% của 0→3", price: sc.targets.wave5.window03.low });
    out.push({ label: "Cửa sổ sóng 5 (sách): 100% của 0→3", price: sc.targets.wave5.window03.high });
  } else {
    out.push({ label: "Mục tiêu đầu tiên của điều chỉnh (đáy/đỉnh sóng 4)", price: sc.points[4].price });
    const [p0, , , , , p5] = sc.points;
    const len = p5.price - p0.price;
    for (const r of [0.382, 0.5, 0.618]) out.push({ label: `Hồi ${(r * 100).toFixed(1).replace(".0", "").replace(".", ",")}% của 0→5`, price: p5.price - r * len });
  }
  return out;
}

/**
 * Trạng thái Elliott tại nến cuối (500 nến gần nhất), đa bậc sóng.
 *   - Có kịch bản được xếp hạng (cấu trúc còn "sống": ≤ 3 pivot sau điểm cuối) -> kịch bản chính + phương án khác.
 *   - Không có, nhưng có tín hiệu sóng 3 đang chạy -> "có thể đang ở sóng 3".
 *   - Còn lại -> nói rõ CHƯA có cấu trúc 5 sóng rõ ràng (không dùng một cấu trúc đã cũ).
 * null khi chưa đủ dữ liệu.
 */
export function elliottState(bars: OhlcvBar[]): ElliottState | null {
  if (bars.length < 60) return null;
  const window = bars.slice(-ELLIOTT_BAR_LIMIT);
  const res = analyzeFull(toCandles(window), { pro: { topN: 3, statTables: ELLIOTT_VN_TABLES } }) as ReturnType<typeof analyzeFull> & { signals?: LiveSignal[] };
  const asOf = window[window.length - 1].date;
  const sc = res.scenarios[0] as Scenario | undefined;
  if (sc) {
    const d = describe(sc, res.pivots);
    const inv = invalidationOf(sc);
    return {
      ...d,
      dir: sc.dir,
      degree: sc.degree ? DEGREE_VI[sc.degree] ?? sc.degree : null,
      weight: sc.weight ?? null,
      scenario: sc,
      alternatives: (res.scenarios.slice(1, 3) as Scenario[]).map((x) => ({ label: describe(x, res.pivots).label, weight: x.weight ?? null })),
      invalidation: inv ? { price: inv.price, side: inv.side, reason: inv.reason } : null,
      levels: levelsOf(sc),
      pivots: res.pivots,
      asOf,
    };
  }
  const w3 = res.signals?.find((x) => x.type === "wave3");
  if (w3) {
    const dirText = w3.dir === "up" ? "tăng" : "giảm";
    return {
      wave: "3", label: `Có thể đang ở sóng 3 (${dirText}) — chưa đủ 5 sóng để xếp hạng`, dir: w3.dir ?? null, degree: "bậc trung",
      weight: null, scenario: null, alternatives: [], invalidation: null,
      levels: [
        ...(w3.targets ?? []).map((t) => ({ label: `Mục tiêu sóng 3 ×${String(t.ratio).replace(".", ",")} sóng 1`, price: t.price })),
        ...(w3.wave4Zones ?? []).map((z) => ({ label: `Vùng sóng 4 tương lai ${String(z.ratio).replace(".", ",")}`, price: z.price })),
      ],
      pivots: res.pivots, asOf,
    };
  }
  return {
    wave: "none", label: "Chưa có cấu trúc 5 sóng rõ ràng ở các bậc gần đây", dir: null, degree: null,
    weight: null, scenario: null, alternatives: [], invalidation: null, levels: [], pivots: res.pivots, asOf,
  };
}
