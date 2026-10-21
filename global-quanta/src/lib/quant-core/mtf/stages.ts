// @gq/quant-core · MTF — máy trạng thái giai đoạn chu kỳ (8 trạng thái), tính TUẦN TỰ từng nến (không nhìn trước).
// Quy tắc theo bộ ảnh: MA chân dưới / chân trên, Dow, quá mua/quá bán so với MA chân trên, hội tụ MA ("chiến tranh"),
// mẫu đảo chiều đã phá cổ. Chuyển giai đoạn cần ứng viên giữ ≥ confirmBars nến (trễ có chủ đích, chống nhiễu),
// trừ khi có mẫu hình đã phá cổ (sự kiện cấu trúc rõ ràng).
import type { Bar } from "../math";
import type { Indicators } from "./core";
import { patternStatusAt } from "./patterns";
import type { Pattern, Stage, TfParams } from "./types";

export const STAGE_CONFIRM_BARS = 3;
export const PATTERN_FRESH_BARS = 20;

export interface StageResult { stage: Stage[]; stageAge: number[] }

export function stageMachine(bars: Bar[], ind: Indicators, dow: number[], patterns: Pattern[], p: TfParams): StageResult {
  const n = bars.length;
  const stage = new Array<Stage>(n).fill("RANGE");
  const stageAge = new Array<number>(n).fill(0);
  let cur: Stage = "RANGE";
  let age = 0;
  let pend: Stage | null = null;
  let pendN = 0;
  const byConf = [...patterns].sort((a, b) => a.confirmedIndex - b.confirmedIndex);

  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const mf = ind.maFast[i], ms = ind.maSlow[i], sl = ind.slope[i], slf = ind.slopeFast[i], dv = ind.dev[i], sp = ind.spread[i];
    if (!Number.isFinite(ms) || !Number.isFinite(sl)) { stage[i] = cur; stageAge[i] = ++age; continue; }

    // Mẫu hình đã phá cổ gần nhất (≤ PATTERN_FRESH_BARS nến) và mẫu đang hình thành.
    let freshBull: Pattern | null = null, freshBear: Pattern | null = null, formingBull = false, formingBear = false;
    for (const pt of byConf) {
      if (pt.confirmedIndex > i) break;
      const st = patternStatusAt(pt, i);
      if (st === "confirmed" && i - (pt.breakIndex as number) <= PATTERN_FRESH_BARS) {
        if (pt.dir === 1) freshBull = pt; else freshBear = pt;
      } else if (st === "forming") {
        if (pt.dir === 1) formingBull = true; else formingBear = true;
      }
    }

    const war = Math.abs(sp) <= p.warAtr;
    const trendUp = mf > ms && sl > 0 && c > ms;
    const trendDn = mf < ms && sl < 0 && c < ms;
    const wasTop = cur === "UP" || cur === "B" || cur === "C";
    const wasBottom = cur === "DOWN" || cur === "Bp" || cur === "D" || cur === "A";
    let cand: Stage;
    let force = false;

    if (freshBear && freshBear.breakIndex === i && wasTop) { cand = "D"; force = true; }
    else if (freshBull && freshBull.breakIndex === i && (wasBottom || cur === "RANGE")) { cand = "UP"; force = true; }
    else if (trendUp) {
      if (dv >= p.overAtr) cand = "B";
      else if (dow[i] === -1 || (c < mf && slf < 0) || formingBear) cand = cur === "D" ? "D" : "C";
      else cand = "UP";
    } else if (trendDn) {
      if (c >= mf - p.touchAtr * Math.max(ind.atr[i], 1e-9) && slf >= 0) cand = "Bp";
      else if (cur === "C" || cur === "B") cand = "D";
      else cand = "DOWN";
    } else {
      // Vùng chuyển tiếp: MA đan xen / giá giữa hai MA.
      if (wasTop) cand = c < ms ? "D" : (war || c < mf ? "C" : cur);
      else if (wasBottom) cand = formingBull || war || c > mf ? "A" : cur === "D" ? "D" : "DOWN";
      else cand = war ? "RANGE" : dow[i] === 1 && c > ms ? "UP" : dow[i] === -1 && c < ms ? "DOWN" : "RANGE";
      if (cur === "A" && c > ms && mf > ms && sl >= 0) cand = "UP";
    }

    if (cand === cur) { pend = null; pendN = 0; }
    else if (force) { cur = cand; age = 0; pend = null; pendN = 0; }
    else {
      if (pend === cand) pendN++; else { pend = cand; pendN = 1; }
      if (pendN >= STAGE_CONFIRM_BARS) { cur = cand; age = 0; pend = null; pendN = 0; }
    }
    stage[i] = cur;
    stageAge[i] = ++age;
  }
  return { stage, stageAge };
}

export const STAGE_LABEL: Record<Stage, string> = {
  A: "A · Tích lũy đáy",
  UP: "Xu hướng tăng",
  B: "B · Quá mua, rủi ro phân phối",
  C: "C · Suy yếu tại đỉnh",
  D: "D · Phá vỡ đi xuống",
  DOWN: "Xu hướng giảm",
  Bp: "B′ · Hồi lên MA trong xu hướng giảm",
  RANGE: "Đi ngang, chưa rõ xu hướng",
};

export const STAGE_TEXT: Record<Stage, string> = {
  A: "Giá ngừng giảm, MA chân dưới và chân trên hội tụ, đang tạo nền đáy. Chờ phá vỡ nền / viền cổ để xác nhận đảo chiều.",
  UP: "Giá trên MA chân trên đang dốc lên, Dow tạo đỉnh – đáy sau cao hơn. Ưu tiên mua khi giá hồi về hỗ trợ / MA.",
  B: "Giá lệch xa MA chân trên (quá mua). Không mua đuổi; chốt lời một phần ở kháng cự, nâng điểm cắt lỗ.",
  C: "Xu hướng tăng yếu dần: giá thủng MA chân dưới hoặc Dow tạo đỉnh thấp hơn, MA bắt đầu hội tụ. Hạ tỷ trọng, không mở mua mới.",
  D: "Giá phá xuống dưới MA chân trên / viền cổ mẫu đỉnh. Cấu trúc tăng đã bị phá — ưu tiên bảo toàn vốn.",
  DOWN: "Giá dưới MA chân trên đang dốc xuống, Dow tạo đỉnh – đáy sau thấp hơn. Đứng ngoài hoặc chỉ giao dịch ngắn rất nhỏ.",
  Bp: "Giá hồi lên chạm MA chân dưới trong xu hướng giảm — thường là điểm bán / giảm tỷ trọng, không phải điểm mua.",
  RANGE: "Hai MA đi ngang, đan xen; chưa có cấu trúc rõ. Chỉ giao dịch ở biên vùng hoặc chờ phá vỡ.",
};
