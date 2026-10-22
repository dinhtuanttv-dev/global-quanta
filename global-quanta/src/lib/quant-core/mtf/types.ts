// @gq/quant-core · Cấu trúc thị trường đa khung (MTF) — kiểu dữ liệu dùng chung.
// Nguồn phương pháp: bộ ảnh "cấu trúc thị trường" (MA chân dưới / chân trên, Dow, Granville, Sanzon, tập trung lệnh)
// + Directional Change (thời gian nội tại). Mọi đối tượng có confirmedIndex: chỉ TỒN TẠI từ nến đó (không nhìn trước).
import type { Bar } from "../math";

export type Tf = "W" | "D" | "H1";
export type Side = "MUA" | "BÁN";

/** Giai đoạn chu kỳ (8 trạng thái). A = [MỘT] tích lũy đáy · Bp = [B′] tái phân phối (hồi lên MA trong xu hướng giảm). */
export type Stage = "A" | "UP" | "B" | "C" | "D" | "DOWN" | "Bp" | "RANGE";

export interface TfParams {
  tf: Tf;
  maFast: number;      // MA chân dưới
  maSlow: number;      // MA chân trên (H1: MA20 ngày = 100 tiết; D: MA20 tuần = 100 phiên)
  atr: number;
  slopeLen: number;
  dcSmall: number;     // ngưỡng Directional Change (bội số ATR) — sóng nhỏ
  dcMid: number;       // sóng trung — mẫu hình, Dow
  dcLarge: number;     // sóng lớn
  touchAtr: number;    // "chạm / tiệm cận MA"
  overAtr: number;     // lệch xa MA chân trên (quá mua / quá bán)
  warAtr: number;      // hai MA hội tụ = "chiến tranh"
  levelLookback: number;
}

export const TF_PARAMS: Record<Tf, TfParams> = {
  H1: { tf: "H1", maFast: 20, maSlow: 100, atr: 14, slopeLen: 5, dcSmall: 1.5, dcMid: 3, dcLarge: 6, touchAtr: 0.6, overAtr: 4, warAtr: 0.5, levelLookback: 500 },
  D: { tf: "D", maFast: 20, maSlow: 100, atr: 14, slopeLen: 5, dcSmall: 1.5, dcMid: 3, dcLarge: 6, touchAtr: 0.6, overAtr: 4, warAtr: 0.5, levelLookback: 500 },
  W: { tf: "W", maFast: 10, maSlow: 40, atr: 14, slopeLen: 3, dcSmall: 1.5, dcMid: 2.5, dcLarge: 5, touchAtr: 0.6, overAtr: 3.5, warAtr: 0.5, levelLookback: 260 },
};

export interface Swing {
  kind: "H" | "L";
  index: number;          // nến cực trị
  confirmedIndex: number; // nến xác nhận (giá đảo chiều ≥ θ·ATR)
  price: number;
  level: "small" | "mid" | "large";
}

export interface Pattern {
  type: "W" | "M" | "IHS" | "HS";
  dir: 1 | -1;
  points: { index: number; price: number; label: string }[];
  neck: { i0: number; p0: number; i1: number; p1: number };
  start: number;
  confirmedIndex: number;           // = nến xác nhận điểm cuối của mẫu -> mẫu "đang hình thành" từ đây
  breakIndex: number | null;        // nến đóng cửa phá viền cổ -> "đã xác nhận"
  failIndex: number | null;         // nến đóng cửa vượt cực trị của mẫu trước khi phá cổ -> "thất bại"
  height: number;                   // độ cao mẫu (để đo mục tiêu)
  target: number;                   // mục tiêu đo theo độ cao từ viền cổ
}

export type PatternStatus = "forming" | "confirmed" | "failed";

export interface Zone {
  lo: number; hi: number; mid: number;
  strength: number;                 // 0..1
  sources: ("Dow" | "Đường" | "MA" | "Khối lượng")[];
  touches: number;
  role: "support" | "resistance";
  flipped: boolean;                 // đổi vai (kháng cự cũ -> hỗ trợ / ngược lại)
}

export interface Base {
  start: number; end: number; lo: number; hi: number;
  bars: number; rangeAtr: number; contractions: number; tight: boolean;
  positionPct: number;              // vị trí giá đóng cửa trong nền (0 = đáy, 100 = đỉnh)
  bbwPct: number | null;            // phân vị độ rộng Bollinger 20 (0 = co hẹp nhất trong 250 nến)
  maConverged: boolean;             // MA chân dưới / chân trên hội tụ
}

export interface Signal {
  index: number; confirmedIndex: number;
  code: "M1" | "M2" | "M3" | "M4" | "B1" | "B2" | "B3" | "B4" | "G3" | "L" | "S" | "KT+" | "KT-";
  side: Side; price: number; note: string;
}

export interface CheckItem { key: string; ok: boolean; text: string }

export interface TfAnalysis {
  tf: Tf;
  params: TfParams;
  bars: Bar[];
  maFast: number[]; maSlow: number[]; atr: number[]; slope: number[]; dev: number[]; spread: number[];
  swings: { small: Swing[]; mid: Swing[]; large: Swing[] };
  dow: number[];                    // +1 / -1 / 0 theo từng nến (sóng trung đã xác nhận)
  stage: Stage[];
  stageAge: number[];
  patterns: Pattern[];
  signals: Signal[];
  zones: Zone[];                    // tại nến cuối
  base: Base | null;                // tại nến cuối
  checklistBuy: CheckItem[];
  checklistSell: CheckItem[];
}

export type { Bar };
