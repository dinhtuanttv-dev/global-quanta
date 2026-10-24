// @gq/quant-core · MTF — máy trạng thái giai đoạn chu kỳ, tính TUẦN TỰ từng nến (không nhìn trước).
// v2 = bản port của detect_market_structure() §3b trong tài liệu gốc (mtf_market_structure.py), giữ NGUYÊN thứ tự ưu tiên:
// D (gãy viền cổ đỉnh / rơi khỏi phân phối) → C (cao trào + đỉnh mức 4 giờ thấp hơn, hoặc mẫu đỉnh đang hình thành) → A (phá cổ
// mẫu đáy) → B (tái tích lũy: điều chỉnh về MA chân trên đang lên) → UP / DOWN → RANGE. Khác bản gốc (MTF-v2-prereg.md):
// không gắn nhãn vùng mẫu hình hồi tố, không gộp đoạn ngắn hồi tố (chỉ giao diện gộp đoạn đã kết thúc), thêm B′ = phần
// "hồi lên MA chân trên" của nhịp giảm (bản gốc gọi chung là DOWN — chuỗi trạng thái nội bộ vẫn dùng DOWN để giữ nguyên quy tắc).
import type { Bar } from "../math";
import type { Indicators } from "./core";
import type { Pattern, Stage, Swing, TfParams } from "./types";

export interface StageResult { stage: Stage[]; stageAge: number[] }

type Raw = Exclude<Stage, "Bp"> | "";

export function stageMachine(bars: Bar[], ind: Indicators, patterns: Pattern[], large: Swing[], p: TfParams): StageResult {
  const n = bars.length;
  const stage = new Array<Stage>(n).fill("RANGE");
  const stageAge = new Array<number>(n).fill(0);
  const C = bars.map((b) => b.close), Lo = bars.map((b) => b.low), Hi = bars.map((b) => b.high);
  const { maFast: ma1, maSlow: ma4, atr, slope, slopeFast, dev, spread } = ind;
  const horizon = 3 * p.maFast;

  // Mẫu phá cổ gần nhất (tăng / giảm) tại từng nến + mẫu đỉnh đang hình thành (từ nến xác nhận tới khi phá / hết hạn).
  const bullBrk = new Array<number>(n).fill(-1e9), bearBrk = new Array<number>(n).fill(-1e9);
  const topForming = new Array<boolean>(n).fill(false);
  for (const pt of patterns) {
    if (pt.breakIndex != null) (pt.dir > 0 ? bullBrk : bearBrk)[pt.breakIndex] = pt.breakIndex;
    if (pt.dir < 0) {
      const end = pt.breakIndex ?? Math.min(n - 1, pt.confirmedIndex + p.breakBars);
      for (let i = pt.confirmedIndex; i < end; i++) topForming[i] = true;
    }
  }
  for (let i = 1; i < n; i++) { bullBrk[i] = Math.max(bullBrk[i], bullBrk[i - 1]); bearBrk[i] = Math.max(bearBrk[i], bearBrk[i - 1]); }

  // Đỉnh "mức 4 giờ" thấp hơn: nhịp tăng ĐÃ tạo đỉnh cao hơn rồi thất bại (z < a, b < a), có hiệu lực từ nến xác nhận b.
  const lowerHigh4h = new Array<boolean>(n).fill(false);
  const bigH = large.filter((s) => s.kind === "H").sort((x, y) => x.confirmedIndex - y.confirmedIndex);
  for (let k = 2; k < bigH.length; k++) {
    const flag = bigH[k - 1].price > bigH[k - 2].price && bigH[k].price < bigH[k - 1].price;
    for (let i = bigH[k].confirmedIndex; i < n; i++) lowerHigh4h[i] = flag;
  }

  let prev = "" as Raw;
  let cur: Stage = "RANGE", age = 0;
  for (let i = 0; i < n; i++) {
    const valid = Number.isFinite(ma4[i]) && Number.isFinite(atr[i]) && Number.isFinite(slope[i]);
    if (valid) {
      const a = atr[i], t = p.touchAtr * a;
      const up = C[i] > ma4[i] && ma1[i] > ma4[i] && slope[i] > 0;
      const down = C[i] < ma4[i] && ma1[i] < ma4[i] && slope[i] < 0;
      const war = Math.abs(spread[i]) < p.warAtr;
      const recentBear = i - bearBrk[i] <= horizon, recentBull = i - bullBrk[i] <= horizon;
      const nearMa = Lo[i] <= ma4[i] + t && C[i] >= ma4[i] - t;
      // phân phối: lệch xa MA chân trên, đà MA chân dưới đã gãy VÀ đỉnh mức 4 giờ thấp hơn đỉnh trước (bên mua cạn sức)
      const climax = dev[i] > p.overAtr * 0.5 && slopeFast[i] < 0 && lowerHigh4h[i];
      let s: Raw;
      if (recentBear && C[i] < ma4[i]) s = "D";                                   // gãy viền cổ đỉnh
      else if (prev === "C" && C[i] < ma4[i]) s = "D";                           // sau phân phối, rơi xuống dưới MA chân trên
      else if (prev === "D" && C[i] < ma4[i] && !down) s = "D";                  // còn trong nhịp đảo chiều tới khi xu hướng giảm hình thành
      else if (slope[i] > 0 && C[i] > ma4[i] && (climax || topForming[i])) s = "C";
      else if (prev === "C" && C[i] > ma4[i] + t) s = "C";                       // còn phân phối cho tới khi về gần MA chân trên
      else if (recentBull && C[i] > ma4[i] && (prev === "" || prev === "A" || prev === "DOWN" || prev === "RANGE" || prev === "D")) s = "A";
      else if (prev === "A" && C[i] > ma4[i] && !up) s = "A";
      else if (slope[i] > 0 && nearMa && (prev === "A" || prev === "UP" || prev === "B" || prev === "RANGE" || prev === "C")) s = "B";
      else if (up) s = "UP";
      else if (down) s = "DOWN";
      else s = war || prev === "RANGE" || prev === "" ? "RANGE" : prev;
      prev = s;
      // B′: nhịp hồi chạm MA chân trên đang xuống trong pha giảm (bản gốc vẫn là DOWN / RANGE).
      const bp = (s === "DOWN" || s === "RANGE") && slope[i] < 0 && Hi[i] >= ma4[i] - t && C[i] <= ma4[i] + t;
      const out: Stage = bp ? "Bp" : s;
      if (out !== cur) { cur = out; age = 0; }
    }
    stage[i] = cur;
    stageAge[i] = ++age;
  }
  return { stage, stageAge };
}

/** Cờ "Quá đà": giá lệch ≥ ngưỡng quá đà khỏi MA chân trên theo đúng chiều dốc của MA (mô tả "không mua đuổi / không bán đuổi"). */
export function extSeries(ind: Indicators, p: TfParams): number[] {
  return ind.dev.map((d, i) => (d >= p.overAtr && ind.slope[i] > 0 ? 1 : d <= -p.overAtr && ind.slope[i] < 0 ? -1 : 0));
}

export const STAGE_LABEL: Record<Stage, string> = {
  A: "MỘT · Tích lũy / Đáy",
  UP: "Xu hướng tăng",
  B: "B · Tái tích lũy",
  C: "C · Phân phối / Đỉnh",
  D: "D · Đảo chiều giảm",
  DOWN: "Xu hướng giảm",
  Bp: "B′ · Hồi lên MA trong xu hướng giảm",
  RANGE: "Củng cố / Nén nền giá",
};

/** Mô tả + hướng hành động (lời của tài liệu gốc, STAGE_TEXT trong mtf_market_structure.py). */
export const STAGE_TEXT: Record<Stage, string> = {
  A: "Giá vượt lên MA chân trên sau đáy W / vai-đầu-vai ngược. Ưu tiên MUA khi giá kiểm tra lại viền cổ / MA chân trên và giữ được (Granville 1 → 3).",
  UP: "Giá trên MA chân trên, MA chân dưới trên MA chân trên, MA chân trên dốc lên. Giữ vị thế; chỉ mua thêm ở nhịp điều chỉnh về MA, không mua ở vùng lệch xa.",
  B: "Giá điều chỉnh về MA chân trên (chân tường) trong xu hướng tăng, nền giá được nâng. Tìm điểm MUA khi bật tăng tại MA (Granville 2/3, điểm L khi khung nhỏ quay lại tăng).",
  C: "Giá lệch xa MA chân trên rồi suy yếu (đỉnh sóng lớn thấp hơn) hoặc đang hình thành đỉnh M / Sanzon. Không mua đuổi; chốt lời dần, chờ gãy viền cổ để BÁN (Granville 4 bán).",
  D: "Giá thủng viền cổ và MA chân trên, MA quay xuống. Đứng ngoài / BÁN khi giá hồi lên MA chân trên thất bại (Granville bán 2/3).",
  DOWN: "Giá dưới MA chân trên, MA chân trên dốc xuống. Không bắt đáy; chờ cấu trúc đáy W / vai-đầu-vai ngược xuất hiện.",
  Bp: "Nhịp hồi chạm MA chân trên đang dốc xuống trong xu hướng giảm — theo tài liệu là vùng BÁN (Granville bán 2/3, điểm S), không phải điểm mua.",
  RANGE: "Hai MA hội tụ, bên mua và bên bán đang giằng co. Không giao dịch trong vùng nhiễu; chờ giá phá vùng nền theo hướng MA chân trên.",
};
