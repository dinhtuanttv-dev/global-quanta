// Confluence Engine - PORT TRUC TIEP tu confluence.py (da va loi theo
// Phan A cua tai lieu ban giao v2.0), giu nguyen 100% logic quyet dinh.
// Day la THUAT TOAN THUAN TUY (khong can du lieu dac biet) - CHI input
// (price/MA/RSI/breadth...) can duoc nuoi bang du lieu THAT thay vi
// market_sim.py (random-walk gia lap).

export function clamp(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, x));
}

export type TrendBias = "uptrend" | "accumulation" | "distribution" | "defensive" | "downtrend";

// A.2 - trend.bias: decision tree day du, co thu tu uu tien (if-elif,
// khong OR song song)
export function computeMaAlignmentScore(ma20: number, ma50: number, ma200: number): number {
  const spreadUp = ma200 ? (ma20 - ma200) / ma200 : 0;
  if (ma20 > ma50 && ma50 > ma200) return clamp(50 + spreadUp * 500);
  if (ma20 < ma50 && ma50 < ma200) return clamp(50 + spreadUp * 500); // spreadUp am -> diem thap
  return 50.0; // dan xen, khong ro xu huong
}

export function computeTrendBias(
  price: number, ma20: number, ma50: number, ma200: number,
  breadthPct: number, deathCrossRecent: boolean, breadthDrop5d: number
): { bias: TrendBias; label: string } {
  const maGapPct = ma200 ? (Math.abs(ma50 - ma200) / ma200) * 100 : 0;

  if (price > ma20 && ma20 > ma50 && ma50 > ma200 && breadthPct > 65) {
    return { bias: "uptrend", label: "Uptrend Xác nhận" };
  }
  if (price < ma20 && ma20 < ma50 && ma50 < ma200 && breadthPct < 35) {
    return { bias: "downtrend", label: "Downtrend / Rủi ro cao" };
  }
  if ((deathCrossRecent || breadthDrop5d > 15) && price < ma50) {
    return { bias: "distribution", label: "Phân phối — Cảnh báo dòng tiền rút" };
  }
  if (maGapPct < 3 && breadthPct >= 40 && breadthPct <= 65) {
    return { bias: "defensive", label: "Phòng thủ / Đi ngang" };
  }
  return { bias: "accumulation", label: "Tích lũy Trung hạn" };
}

// A.4 - impulseScore lien tuc (khong dung bac thang roi rac)
export function computeImpulseScore(rsi14: number, breadthPct: number, maAlignmentScore: number, atrPercentile: number): number {
  const trendComponentContinuous = clamp(0.6 * breadthPct + 0.4 * maAlignmentScore);
  const score = 0.30 * clamp(rsi14) + 0.30 * clamp(breadthPct) + 0.20 * trendComponentContinuous + 0.20 * (100 - clamp(atrPercentile));
  return Math.round(clamp(score) * 10) / 10;
}

export type ConfluenceStatus =
  | "THUAN_XU_HUONG_MANH" | "THUAN_XU_HUONG" | "TRUNG_LAP"
  | "DONG_THUAN_TICH_LUY" | "PHONG_THU_CHUAN" | "THUAN_PHONG_THU"
  | "DAN_DAT_NGUOC_DONG" | "NGHICH_XU_HUONG";

export interface ConfluenceResult {
  statusCode: ConfluenceStatus;
  statusLabel: string;
  boost: number;
  reasonCodes: string[];
  breakoutBoostBadge: boolean;
}

// A.3/A.7 - Decision matrix da va + statusCode/statusLabel tach biet.
// GIU NGUYEN TUYET DOI cau truc if-elif va nguong so - day la BANG MA
// TRAN QUYET DINH da duoc chot, khong duoc tu y doi.
export function computeConfluence(
  bias: TrendBias, trendTag: string, rsRating: number, qualityTag: string, breakoutProbability: number
): ConfluenceResult {
  let reasonCodes: string[] = [];
  let statusCode: ConfluenceStatus = "TRUNG_LAP";
  let statusLabel = "Trung lập";
  let boost = 0.0;

  if (bias === "uptrend") {
    if (trendTag === "Up-Trend" && rsRating >= 80) {
      statusCode = "THUAN_XU_HUONG_MANH"; statusLabel = "Thuận xu hướng mạnh"; boost = 2;
      reasonCodes = ["TREND_ALIGNED", "RS_ABOVE_80"];
    } else if (trendTag === "Up-Trend") {
      statusCode = "THUAN_XU_HUONG"; statusLabel = "Thuận xu hướng"; boost = 1;
      reasonCodes = ["TREND_ALIGNED"];
    }
  } else if (bias === "defensive") {
    // A.3: case moi - Up-Trend + RS cuc cao giua thi truong phong thu duoc THUONG, khong phat
    if (trendTag === "Up-Trend" && rsRating >= 90) {
      statusCode = "DAN_DAT_NGUOC_DONG"; statusLabel = "Dẫn dắt ngược dòng (Leader)"; boost = 2;
      reasonCodes = ["RS_ABOVE_90", "DEFENSIVE_LEADER"];
    } else if (trendTag === "Accumulation" && qualityTag === "Low Debt") {
      statusCode = "PHONG_THU_CHUAN"; statusLabel = "Phòng thủ chuẩn"; boost = 2;
      reasonCodes = ["DEFENSIVE_MATCH", "LOW_DEBT"];
    } else if (trendTag === "Accumulation") {
      statusCode = "THUAN_PHONG_THU"; statusLabel = "Thuận phòng thủ"; boost = 1;
      reasonCodes = ["DEFENSIVE_MATCH"];
    } else if (trendTag === "Up-Trend") { // rsRating < 90
      statusCode = "TRUNG_LAP"; statusLabel = "Trung lập-mạnh"; boost = 0;
      reasonCodes = ["TREND_ALIGNED_BUT_RS_LOW"];
    } else { // Down-Trend, Distribution
      statusCode = "NGHICH_XU_HUONG"; statusLabel = "Nghịch xu hướng"; boost = -1;
      reasonCodes = ["TREND_MISALIGNED"];
    }
  } else if (bias === "distribution" || bias === "downtrend") {
    // nhanh moi o A.2 chua co trong ma tran goc - ap cung logic "nghich
    // xu huong" tru khi co phieu thuc su di nguoc dong rat manh (RS>=90)
    if (trendTag === "Up-Trend" && rsRating >= 90) {
      statusCode = "DAN_DAT_NGUOC_DONG"; statusLabel = "Dẫn dắt ngược dòng (Leader)"; boost = 1;
      reasonCodes = ["RS_ABOVE_90", "COUNTER_TREND_LEADER"];
    } else {
      statusCode = "NGHICH_XU_HUONG"; statusLabel = "Nghịch xu hướng"; boost = -1;
      reasonCodes = ["MARKET_WEAK"];
    }
  } else { // accumulation
    if (trendTag === "Accumulation" && rsRating >= 75) {
      statusCode = "DONG_THUAN_TICH_LUY"; statusLabel = "Đồng thuận tích lũy"; boost = 2;
      reasonCodes = ["ACCUM_ALIGNED", "RS_ABOVE_75"];
    } else if (trendTag === "Accumulation" || trendTag === "Up-Trend") {
      statusCode = "THUAN_XU_HUONG"; statusLabel = "Thuận xu hướng"; boost = 1;
      reasonCodes = ["ACCUM_ALIGNED"];
    }
  }

  // A.6 - tan dung breakoutProbability lam badge phu, khong doi bang ma tran goc
  const breakoutBadge = boost >= 1 && breakoutProbability >= 70;

  return { statusCode, statusLabel, boost, reasonCodes, breakoutBoostBadge: breakoutBadge };
}
