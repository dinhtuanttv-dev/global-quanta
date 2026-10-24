// @gq/quant-core · Cấu trúc thị trường đa khung (MTF) — kiểu dữ liệu dùng chung.
// Nguồn phương pháp: bộ ảnh "cấu trúc thị trường" (MA chân dưới / chân trên, Dow, Granville, Sanzon, tập trung lệnh)
// + bản Python gốc mtf_market_structure.py (v2: bám nguyên tham số / quy tắc, xem backend/src/market/structure/MTF-v2-prereg.md)
// + Directional Change (thời gian nội tại). Mọi đối tượng có confirmedIndex: chỉ TỒN TẠI từ nến đó (không nhìn trước).
import type { Bar } from "../math";

export type Tf = "W" | "D" | "H1";
export type Side = "MUA" | "BÁN";

/**
 * Giai đoạn chu kỳ (8 trạng thái, theo tài liệu gốc). A = [MỘT] tích lũy / đáy · B = TÁI TÍCH LŨY (điều chỉnh về MA chân trên
 * trong xu hướng tăng — vùng tìm điểm mua) · C = phân phối / đỉnh · D = đảo chiều giảm · Bp = [B′] hồi lên MA chân trên trong
 * xu hướng giảm (đối xứng của B, mở rộng). "Quá đà" (lệch xa MA) KHÔNG phải giai đoạn mà là cờ mô tả (TfAnalysis.ext).
 */
export type Stage = "A" | "UP" | "B" | "C" | "D" | "DOWN" | "Bp" | "RANGE";

export interface TfParams {
  tf: Tf;
  maFast: number;      // MA chân dưới
  maSlow: number;      // MA chân trên (H1: MA 4 giờ = 80 tiết; D: MA20 tuần = 100 phiên)
  maCtx: number | null; // MA bối cảnh khung lớn hơn nữa, chỉ để vẽ (H1: MA ngày = 100 tiết)
  atr: number;
  slopeLen: number;
  dcSmall: number;     // ngưỡng ZigZag (bội số ATR) — sóng nhỏ
  dcMid: number;       // sóng trung — mẫu hình, Dow
  dcLarge: number;     // sóng lớn
  touchAtr: number;    // "chạm / tiệm cận MA"
  overAtr: number;     // lệch xa MA chân trên (quá mua / quá bán)
  warAtr: number;      // hai MA hội tụ = "chiến tranh"
  levelLookback: number;
  patternTol: number;  // hai đáy / đỉnh "bằng nhau" (bội số ATR)
  neckMinAtr: number;  // viền cổ cách cực trị tối thiểu
  neckMaxSlopeAtr: number; // viền cổ vai–đầu–vai lệch quá mức -> dùng viền cổ ngang tại cổ gần nhất
  breakBars: number;   // mẫu phải phá viền cổ trong N nến kể từ khi xác nhận điểm cuối
  cooldown: number;    // cùng một loại tín hiệu cách nhau tối thiểu N nến
  minStageBars: number; // HIỂN THỊ: đoạn giai đoạn đã kết thúc ngắn hơn N nến được gộp vào đoạn trước (giai đoạn hiện tại luôn thô)
}

// v2 (MTF-v2-prereg.md): ngưỡng lấy NGUYÊN Config của bản Python gốc (zz 1,5 / 2,5 / 4,0 · chạm 0,6 · quá đà 3,0 · hội tụ 0,35 ·
// sai số mẫu 0,8 · viền cổ 1,5 · phá cổ trong 60 nến · giãn tín hiệu 12 · đoạn tối thiểu 8). Khung D / W là phân hình tương tự.
const SRC = { atr: 14, dcSmall: 1.5, dcMid: 2.5, dcLarge: 4, touchAtr: 0.6, overAtr: 3, warAtr: 0.35, patternTol: 0.8, neckMinAtr: 1.5, neckMaxSlopeAtr: 1.5 } as const;
export const TF_PARAMS: Record<Tf, TfParams> = {
  H1: { tf: "H1", ...SRC, maFast: 20, maSlow: 80, maCtx: 100, slopeLen: 5, levelLookback: 500, breakBars: 60, cooldown: 12, minStageBars: 8 },
  D: { tf: "D", ...SRC, maFast: 20, maSlow: 100, maCtx: null, slopeLen: 5, levelLookback: 500, breakBars: 60, cooldown: 12, minStageBars: 5 },
  W: { tf: "W", ...SRC, maFast: 10, maSlow: 40, maCtx: null, slopeLen: 3, levelLookback: 260, breakBars: 30, cooldown: 6, minStageBars: 3 },
};

export interface Swing {
  kind: "H" | "L";
  index: number;          // nến cực trị
  confirmedIndex: number; // nến xác nhận (giá đảo chiều ≥ k·ATR, ZigZag high/low như tài liệu gốc)
  price: number;
  level: "small" | "mid" | "large";
}

/** Vị trí của mẫu trên "cẳng sóng" (tài liệu: quan trọng là hình dạng xuất hiện Ở ĐÂU, không chỉ hình dạng). */
export type PatternContext =
  | "reversal"      // mẫu đáy sau nhịp giảm (MA chân trên dốc xuống / ngang) = nền đáy [MỘT]; mẫu đỉnh sau nhịp tăng đã chững = phân phối
  | "reaccum"       // mẫu đáy trong xu hướng tăng (MA chân trên dốc lên) = nền tái tích lũy [B] — thuận xu hướng
  | "countertrend"; // mẫu đỉnh giữa xu hướng tăng mạnh (MA dốc lên, Dow tăng) — "người bán ở mũi tên hồng", lợi thế thấp

export interface Pattern {
  type: "W" | "M" | "IHS" | "HS";
  dir: 1 | -1;
  context: PatternContext;
  points: { index: number; price: number; label: string }[];
  neck: { i0: number; p0: number; i1: number; p1: number };
  start: number;
  confirmedIndex: number;           // = nến xác nhận điểm cuối của mẫu -> mẫu "đang hình thành" từ đây
  breakIndex: number | null;        // nến đóng cửa phá viền cổ -> "đã xác nhận"
  failIndex: number | null;         // nến đóng cửa vượt cực trị của mẫu trước khi phá cổ, hoặc hết hạn chờ phá cổ -> "thất bại"
  followIndex: number | null;       // sau phá cổ, giá sang hẳn phía bên kia MA chân trên VÀ MA đổi hướng theo (≤ 3·MA nhanh nến) -> "thành công"
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

/** R:R "nếu mua ở giá hiện tại" (bản Python): cắt lỗ = đáy sóng nhỏ gần nhất − 0,2 ATR; mục tiêu = đỉnh sóng lớn phía trên, không có thì 3R. */
export interface RrNow { entry: number; stop: number; target: number; targetBasis: "swing4h" | "3R"; rr: number; ok: boolean }

export interface TfAnalysis {
  tf: Tf;
  params: TfParams;
  bars: Bar[];
  maFast: number[]; maSlow: number[]; atr: number[]; slope: number[]; dev: number[]; spread: number[];
  swings: { small: Swing[]; mid: Swing[]; large: Swing[] };
  maCtx: number[] | null;
  dow: number[];                    // +1 / -1 / 0 theo từng nến (sóng trung đã xác nhận)
  ext: number[];                    // cờ "Quá đà": +1 lệch ≥ quá đà trên MA đang lên, −1 lệch dưới MA đang xuống, 0
  rrNow: RrNow | null;              // R:R nếu mua tại giá hiện tại (cách của tài liệu)
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
