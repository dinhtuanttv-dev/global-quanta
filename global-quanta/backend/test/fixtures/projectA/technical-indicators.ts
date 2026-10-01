// ============================================================
// TECHNICAL INDICATORS - hop nham tinh toan thuan tu OHLCV
// Tat ca ham la PURE FUNCTION: cung input luon ra cung output,
// khong goi network, khong side-effect -> de unit test doc lap.
// ============================================================

import type { OhlcvBar } from "./tcbs-adapter";

/** Simple Moving Average tai diem cuoi cung cua mang gia dong cua. */
export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

/** % lech cua gia hien tai so voi MA(period). Duong = gia tren MA. */
export function percentVsMA(closes: number[], period: number): number | null {
  const ma = calculateSMA(closes, period);
  if (ma === null || ma === 0) return null;
  const lastClose = closes[closes.length - 1];
  return Math.round(((lastClose - ma) / ma) * 1000) / 10; // % voi 1 chu so sau dau phay
}

export type Ma50Status = "safe" | "warning" | "broken";

/**
 * Xac dinh trang thai MA50 dua tren % lech thuc te, KHONG gan tay.
 * Quy uoc: gia duoi MA50 > 3% lien tuc -> broken; trong khoang [-3%, 0%) -> warning.
 */
export function classifyMa50Status(closes: number[]): Ma50Status {
  const pct = percentVsMA(closes, 50);
  if (pct === null) return "safe"; // chua du du lieu -> khong ket luan tieu cuc
  if (pct < -3) return "broken";
  if (pct < 0) return "warning";
  return "safe";
}

/**
 * Relative Strength so voi benchmark (vd VN-Index) trong N ngay.
 * RS = (% thay doi cua co phieu) - (% thay doi cua benchmark) trong cung ky.
 */
export function calculateRelativeStrength(
  stockCloses: number[],
  benchmarkCloses: number[],
  periodDays: number
): number | null {
  if (stockCloses.length < periodDays + 1 || benchmarkCloses.length < periodDays + 1) {
    return null;
  }
  const stockStart = stockCloses[stockCloses.length - 1 - periodDays];
  const stockEnd = stockCloses[stockCloses.length - 1];
  const benchStart = benchmarkCloses[benchmarkCloses.length - 1 - periodDays];
  const benchEnd = benchmarkCloses[benchmarkCloses.length - 1];

  if (stockStart === 0 || benchStart === 0) return null;

  const stockPctChange = ((stockEnd - stockStart) / stockStart) * 100;
  const benchPctChange = ((benchEnd - benchStart) / benchStart) * 100;

  return Math.round((stockPctChange - benchPctChange) * 10) / 10;
}

/** Ty le khoi luong phien gan nhat so voi khoi luong trung binh N phien truoc do. */
export function calculateVolumeSpikeRatio(bars: OhlcvBar[], avgPeriod: number = 20): number | null {
  if (bars.length < avgPeriod + 1) return null;
  const recentVolumes = bars.slice(bars.length - 1 - avgPeriod, bars.length - 1).map((b) => b.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  if (avgVolume === 0) return null;
  const latestVolume = bars[bars.length - 1].volume;
  return Math.round((latestVolume / avgVolume) * 100) / 100;
}

/** Trich danh sach gia dong cua tu mang OHLCV, theo thu tu thoi gian tang dan. */
export function extractCloses(bars: OhlcvBar[]): number[] {
  return bars.map((b) => b.close);
}

// ============================================================
// AVERAGE TRUE RANGE (ATR) - HARD_DATA
// Do bien dong tuyet doi trung binh - dung cho truc thoi gian theo ATR
// cua Cycle Fingerprint (phien bien dong cao "chiem nhieu khong gian thoi
// gian" hon phien bien dong thap khi so sanh mau hinh gia).
// ============================================================

/** True Range tai TUNG phien (mang cung do dai voi bars, phien dau = high-low don gian vi chua co dong cua hom truoc). */
export function calculateTrueRangeSeries(bars: OhlcvBar[]): number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
}

/** ATR (trung binh truot don gian cua True Range, chu ky mac dinh 14 phien) tai TUNG phien. */
export function calculateAtrSeries(bars: OhlcvBar[], period: number = 14): number[] {
  const tr = calculateTrueRangeSeries(bars);
  const atr: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = tr.slice(start, i + 1);
    atr.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return atr;
}

// ============================================================
// PRICE-VOLUME TREND (PVT) - HARD_DATA
// Do "dong tien co trong luong" - khac RS (chi nhin gia) va Volume Spike
// (chi nhin 1 phien dot bien) o cho PVT tich luy CA huong gia LAN khoi
// luong qua nhieu phien lien tuc, phat hien dong tien vao/ra ben vung
// thay vi 1 phien dot bien roi tat.
// ============================================================

/** PVT tich luy tai TUNG phien (mang cung do dai voi bars). */
export function calculatePVT(bars: OhlcvBar[]): number[] {
  const pvt: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      const prevClose = bars[i - 1].close;
      if (prevClose !== 0) {
        cumulative += bars[i].volume * ((bars[i].close - prevClose) / prevClose);
      }
    }
    pvt.push(cumulative);
  }
  return pvt;
}

/**
 * Diem xu huong PVT trong N phien gan nhat, CHUAN HOA theo bien do PVT
 * trong chinh ky do (khong dung gia tri tuyet doi - von rat khac nhau
 * giua ma von hoa lon/nho, khong the so sanh truc tiep giua cac ma).
 * Tra ve -100 (dong tien rut manh) den +100 (dong tien vao manh).
 */
export function calculatePVTTrendScore(bars: OhlcvBar[], lookback: number = 20): number | null {
  if (bars.length < lookback + 1) return null;
  const pvtSeries = calculatePVT(bars).slice(-lookback);
  const first = pvtSeries[0];
  const last = pvtSeries[pvtSeries.length - 1];
  const range = Math.max(...pvtSeries) - Math.min(...pvtSeries);
  if (range === 0) return 0;
  return Math.round(((last - first) / range) * 100);
}

// ============================================================
// ACCUMULATION/DISTRIBUTION LINE (A/D) - HARD_DATA
// Do ap luc mua/ban THUC SU trong TUNG phien qua vi tri dong cua so voi
// bien do cao-thap trong phien (dong cua gan dinh = ap luc mua manh, du
// gia co the chua tang manh) - phat hien tich luy/phan phoi SOM hon RS
// (von chi phan anh sau khi gia da thay doi ro ret).
// ============================================================

/** A/D Line tich luy tai TUNG phien (mang cung do dai voi bars). */
export function calculateADLine(bars: OhlcvBar[]): number[] {
  const ad: number[] = [];
  let cumulative = 0;
  for (const bar of bars) {
    const range = bar.high - bar.low;
    // Money Flow Multiplier: -1 (dong cua tai day) den +1 (dong cua tai dinh)
    const mfm = range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    cumulative += mfm * bar.volume;
    ad.push(cumulative);
  }
  return ad;
}

/** Diem xu huong A/D trong N phien gan nhat, chuan hoa giong PVTTrendScore. */
export function calculateADTrendScore(bars: OhlcvBar[], lookback: number = 20): number | null {
  if (bars.length < lookback + 1) return null;
  const adSeries = calculateADLine(bars).slice(-lookback);
  const first = adSeries[0];
  const last = adSeries[adSeries.length - 1];
  const range = Math.max(...adSeries) - Math.min(...adSeries);
  if (range === 0) return 0;
  return Math.round(((last - first) / range) * 100);
}

// ============================================================
// BOLLINGER BAND - HARD_DATA (tinh tu OHLCV thuc)
// ============================================================

export interface BollingerBand {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number; // (upper - lower) / middle * 100 - do rong tuong doi
}

/** Tinh Bollinger Band tai diem cuoi cua chuoi gia dong cua. */
export function calculateBollingerBand(
  closes: number[],
  period: number = 20,
  multiplier: number = 2
): BollingerBand | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = sma + multiplier * stdDev;
  const lower = sma - multiplier * stdDev;
  const bandwidth = sma > 0 ? ((upper - lower) / sma) * 100 : 0;
  return {
    upper: Math.round(upper),
    lower: Math.round(lower),
    middle: Math.round(sma),
    bandwidth: Math.round(bandwidth * 100) / 100,
  };
}

/**
 * CONTRACTION CHECK (HARD_DATA):
 * Kiem tra do rong Bollinger Band hien tai co o muc thap nhat trong N phien khong.
 * Neu co -> sap co bien dong lon (breakout hoac breakdown).
 * Returns: { isContracting, percentile, bandwidthHistory }
 */
export function checkBollingerContraction(
  closes: number[],
  bbPeriod: number = 20,
  lookbackPeriod: number = 20
): { isContracting: boolean; percentile: number; currentBandwidth: number | null } {
  if (closes.length < bbPeriod + lookbackPeriod) {
    return { isContracting: false, percentile: 50, currentBandwidth: null };
  }

  // Tinh bandwidth cho moi phien trong lookbackPeriod phien gan nhat
  const bandwidths: number[] = [];
  for (let i = lookbackPeriod; i >= 0; i--) {
    const slice = closes.slice(0, closes.length - i);
    const bb = calculateBollingerBand(slice, bbPeriod);
    if (bb) bandwidths.push(bb.bandwidth);
  }

  if (bandwidths.length === 0) return { isContracting: false, percentile: 50, currentBandwidth: null };

  const currentBandwidth = bandwidths[bandwidths.length - 1];
  const sortedBw = [...bandwidths].sort((a, b) => a - b);
  const rank = sortedBw.findIndex((bw) => bw >= currentBandwidth);
  const percentile = Math.round((rank / sortedBw.length) * 100);

  // Contracting khi bandwidth o muc thap nhat trong N phien (percentile < 20%)
  const isContracting = percentile <= 20;

  return { isContracting, percentile, currentBandwidth };
}

// ============================================================
// MARKET REGIME DETECTION (HARD_DATA + logic ket hop)
// ============================================================

export type MarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "SIDEWAYS" | "UNKNOWN";

/**
 * Nhan dien trang thai thi truong dua tren:
 * - Vi tri gia so voi MA50 va MA200 (HARD_DATA)
 * - Do doc cua MA50 (momentum)
 * - ADX proxy (do manh xu huong) uoc tinh tu do bien dong gia
 *
 * Khi TRENDING: dung window ngan (20 phien) cho pattern detection
 * Khi SIDEWAYS: dung window rong (50 phien) de loc nhieu
 */
export function detectMarketRegime(closes: number[]): {
  regime: MarketRegime;
  recommendedWindow: number;
  confidence: number; // 0-100, HARD_DATA confidence
  signals: string[];
} {
  if (closes.length < 60) {
    return { regime: "UNKNOWN", recommendedWindow: 20, confidence: 0, signals: ["Khong du du lieu (can > 60 phien)"] };
  }

  const signals: string[] = [];
  let trendScore = 0; // duong = up trend, am = down trend, gan 0 = sideways

  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma200 = calculateSMA(closes, 200 > closes.length ? closes.length : 200);
  const lastClose = closes[closes.length - 1];

  // --- Kiem tra vi tri gia ---
  if (ma50 && lastClose > ma50) { trendScore += 2; signals.push("Gia tren MA50"); }
  else if (ma50) { trendScore -= 2; signals.push("Gia duoi MA50"); }

  if (ma200 && lastClose > ma200) { trendScore += 1; signals.push("Gia tren MA200"); }
  else if (ma200) { trendScore -= 1; signals.push("Gia duoi MA200"); }

  // --- Kiem tra do doc MA20 (momentum proxy) ---
  if (ma20 && closes.length >= 25) {
    const ma20_5ago = calculateSMA(closes.slice(0, -5), 20);
    if (ma20_5ago) {
      const ma20Slope = ((ma20 - ma20_5ago) / ma20_5ago) * 100;
      if (ma20Slope > 1) { trendScore += 2; signals.push(`MA20 doc len manh (+${ma20Slope.toFixed(1)}%)`); }
      else if (ma20Slope > 0.2) { trendScore += 1; signals.push("MA20 tang nhe"); }
      else if (ma20Slope < -1) { trendScore -= 2; signals.push(`MA20 doc xuong manh (${ma20Slope.toFixed(1)}%)`); }
      else if (ma20Slope < -0.2) { trendScore -= 1; signals.push("MA20 giam nhe"); }
      else { signals.push("MA20 di ngang (Sideways)"); }
    }
  }

  // --- Kiem tra bien do gia (ADX proxy: bien do lon = xu huong ro, nho = sideways) ---
  const recentHighs = closes.slice(-20);
  const rangeRatio = (Math.max(...recentHighs) - Math.min(...recentHighs)) / Math.min(...recentHighs) * 100;
  if (rangeRatio > 15) { signals.push(`Bien do gia lon (${rangeRatio.toFixed(1)}%) - xu huong ro`); }
  else if (rangeRatio < 5) { signals.push(`Bien do gia hep (${rangeRatio.toFixed(1)}%) - di ngang`); trendScore = trendScore * 0.5; }

  // --- Phan loai regime ---
  let regime: MarketRegime;
  let recommendedWindow: number;

  if (trendScore >= 3) { regime = "TRENDING_UP"; recommendedWindow = 20; }
  else if (trendScore <= -3) { regime = "TRENDING_DOWN"; recommendedWindow = 20; }
  else { regime = "SIDEWAYS"; recommendedWindow = 50; }

  const confidence = Math.min(100, Math.round(Math.abs(trendScore) / 6 * 100));

  return { regime, recommendedWindow, confidence, signals };
}

// ============================================================
// SCORED STOCK INTERFACE - chuẩn đầu ra cho Scoring Algorithm
// ============================================================

export type DataQuality = "HARD_DATA" | "ESTIMATED" | "INSUFFICIENT";

export interface ScoredStock {
  ticker: string;
  sector: string;

  // HARD_DATA - tinh tu OHLCV thuc (Yahoo Finance)
  rs3m: number | null;           // Relative Strength 3 thang - HARD_DATA
  ma50Status: "safe" | "warning" | "broken" | null; // HARD_DATA
  volumeSpikeRatio: number | null; // HARD_DATA
  ma50Value: number | null;        // HARD_DATA
  latestClose: number | null;      // HARD_DATA
  bollingerBandwidth: number | null; // HARD_DATA
  isContracting: boolean;          // HARD_DATA - Bollinger Contraction

  // ESTIMATED - uoc tinh tu du lieu co san
  marketRegime: MarketRegime;      // ESTIMATED (proxy tu MA)
  regimeConfidence: number;        // ESTIMATED

  // SCORING (tong hop)
  scores: {
    pattern: number;     // 0-30: RS + BB Contraction bonus
    volume: number;      // 0-20: Vol Spike ratio
    rs: number;          // 0-20: Relative Strength
    momentum: number;    // 0-30: MA50 status + trend
    total: number;       // 0-100
    confluence: number;  // so dieu kien dong thuan (0-4)
  };

  dataQuality: DataQuality;
  signals: string[];     // giai thich tai sao chon ma nay
  riskFlags: string[];   // canh bao rui ro
}

/**
 * Tinh SCORING ALGORITHM toan phan cho 1 ma (HARD_DATA):
 * - 30% Pattern Score (RS + BB Contraction)
 * - 20% Volume Score (Vol Spike)
 * - 20% RS Score (Relative Strength vs VN-Index)
 * - 30% Momentum Score (MA50 status + trend)
 *
 * Confluence Check: chi chap nhan tin hieu khi >= 2 dieu kien dong thuan.
 */
export function computeScoredStock(
  ticker: string,
  sector: string,
  rs3m: number | null,
  ma50Status: "safe" | "warning" | "broken" | null,
  volumeSpikeRatio: number | null,
  ma50Value: number | null,
  latestClose: number | null,
  closes: number[],
  tang3Score?: number
): ScoredStock {
  const signals: string[] = [];
  const riskFlags: string[] = [];

  // --- BB Contraction (HARD_DATA) ---
  const contraction = checkBollingerContraction(closes, 20, 20);
  const bb = calculateBollingerBand(closes, 20);

  // --- Market Regime (ESTIMATED) ---
  const regimeResult = detectMarketRegime(closes);

  // --- Pattern Score (0-30) ---
  let patternScore = 0;
  const baseRsScore = rs3m !== null ? Math.max(0, Math.min(20, (rs3m + 20) * 0.5)) : 0;
  patternScore += baseRsScore;
  // BB Contraction bonus: +20% khi dang tich luy (breakout sap xay ra)
  if (contraction.isContracting) {
    patternScore = Math.min(30, patternScore * 1.2);
    signals.push(`BB Contraction (percentile ${contraction.percentile}%) - sap breakout`);
  }
  patternScore = Math.round(patternScore);

  // --- Volume Score (0-20) ---
  let volumeScore = 0;
  if (volumeSpikeRatio !== null) {
    volumeScore = Math.min(20, Math.round((volumeSpikeRatio - 1) * 10));
    if (volumeScore < 0) volumeScore = 0;
    if (volumeSpikeRatio >= 1.5) signals.push(`Vol Spike ${volumeSpikeRatio}x trung binh`);
  }

  // --- RS Score (0-20) ---
  let rsScore = 0;
  if (rs3m !== null) {
    rsScore = Math.min(20, Math.max(0, Math.round((rs3m + 10) * 0.67)));
    if (rs3m > 5) signals.push(`RS 3T manh (+${rs3m}% vs VN-Index)`);
    else if (rs3m < -5) riskFlags.push(`RS 3T yeu (${rs3m}% vs VN-Index)`);
  }

  // --- Momentum Score (0-30) ---
  let momentumScore = 0;
  if (ma50Status === "safe") { momentumScore = 20; signals.push("Gia tren MA50 (safe)"); }
  else if (ma50Status === "warning") { momentumScore = 8; riskFlags.push("Canh bao MA50"); }
  else if (ma50Status === "broken") { momentumScore = 0; riskFlags.push("Vi pham MA50 - rui ro cao"); }
  // Them diem cho regime thuận lợi
  if (regimeResult.regime === "TRENDING_UP") { momentumScore = Math.min(30, momentumScore + 10); signals.push("Thi truong dang xu huong tang"); }
  else if (regimeResult.regime === "SIDEWAYS") { momentumScore = Math.min(30, momentumScore + 3); }
  momentumScore = Math.round(momentumScore);

  // --- Tang3Score bonus (neu co, add 10% vao total) ---
  const tang3Bonus = tang3Score ? Math.min(5, tang3Score / 20) : 0;

  const total = Math.min(100, Math.round(patternScore + volumeScore + rsScore + momentumScore + tang3Bonus));

  // --- Confluence Check: dem so dieu kien dong thuan ---
  let confluence = 0;
  if (rs3m !== null && rs3m > 0) confluence++;
  if (volumeSpikeRatio !== null && volumeSpikeRatio > 1.2) confluence++;
  if (ma50Status === "safe") confluence++;
  if (contraction.isContracting) confluence++;

  // --- Data Quality ---
  const dataQuality: DataQuality =
    rs3m !== null && ma50Status !== null && volumeSpikeRatio !== null ? "HARD_DATA"
    : closes.length > 0 ? "ESTIMATED"
    : "INSUFFICIENT";

  return {
    ticker, sector, rs3m, ma50Status, volumeSpikeRatio, ma50Value, latestClose,
    bollingerBandwidth: bb?.bandwidth ?? null,
    isContracting: contraction.isContracting,
    marketRegime: regimeResult.regime,
    regimeConfidence: regimeResult.confidence,
    scores: { pattern: patternScore, volume: volumeScore, rs: rsScore, momentum: momentumScore, total, confluence },
    dataQuality,
    signals,
    riskFlags,
  };
}

// ============================================================
// RSI (Relative Strength Index) - Wilder's smoothing method chuan.
// Dung cho Tab Co Tuc (P0 - thay du lieu mau bang du lieu that).
// ============================================================
export function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);

  // Trung binh cong period dau tien (khoi tao Wilder smoothing)
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    avgGain += Math.max(c, 0);
    avgLoss += Math.max(-c, 0);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing cho cac gia tri con lai
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    const gain = Math.max(c, 0);
    const loss = Math.max(-c, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100; // khong co phien giam nao trong giai doan smoothing gan nhat
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** EMA (Exponential Moving Average) - can cho MACD. */
function calculateEMASeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * MACD Histogram (12,26,9 chuan) - dung cho Sieu Quet AI Confluence
 * Engine (momentum.macdHistogram). Can it nhat ~35 gia dong cua de co
 * ket qua on dinh (EMA can thoi gian "warm up").
 */
export function calculateMACDHistogram(closes: number[]): number | null {
  if (closes.length < 26) return null;
  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = calculateEMASeries(macdLine, 9);
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  return Math.round(histogram * 100) / 100;
}
