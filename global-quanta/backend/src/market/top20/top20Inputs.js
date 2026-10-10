// Radar Top 20 (T0, 2026-10-10) — thành phần đầu vào cho điểm hội tụ, tính trên chuỗi ĐIỀU CHỈNH CỘNG DỒN của cả universe
// (thay Yahoo 6 tháng chưa điều chỉnh + 61 mã viết cứng ở Project A). Project A vẫn chấm điểm (confluence-score.ts) — hợp đồng giữ nguyên.
//   rs3m            lợi suất 63 phiên của mã − của VN-Index, % — CĂN THEO NGÀY (trước đây Yahoo VN-Index chỉ trả 1 nến -> null ở mọi mã)
//   volumeSpikeRatio  GTGD TB20 / GTGD TB250 (dòng tiền bất thường bền hơn 1 phiên; thang tương tự tỷ lệ cũ ~0,5–3)
//   pvtScore, adScore  xu hướng PVT / A-D 20 phiên chuẩn hoá −100..100 (cùng công thức Project A)
//   avgValue60, liquid  GTGD TB60 (đồng) và cờ ≥ 5 tỷ
// Hàm thuần — không I/O.

export const TOP20_INPUTS_ENGINE = "top20/T0";
export const TOP20_MIN_VALUE = 5e9;

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

function trendScore(series) {
  const first = series[0], last = series[series.length - 1];
  const range = Math.max(...series) - Math.min(...series);
  return range === 0 ? 0 : Math.round(((last - first) / range) * 100);
}

/** PVT 20 phiên (cùng công thức Project A calculatePVTTrendScore). */
export function pvtTrend(bars, lookback = 20) {
  if (bars.length < lookback + 1) return null;
  const pvt = []; let cum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0 && bars[i - 1].close) cum += (bars[i].volume ?? 0) * ((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
    pvt.push(cum);
  }
  return trendScore(pvt.slice(-lookback));
}

/** A/D 20 phiên (cùng công thức Project A calculateADTrendScore). */
export function adTrend(bars, lookback = 20) {
  if (bars.length < lookback + 1) return null;
  const ad = []; let cum = 0;
  for (const b of bars) {
    const range = b.high - b.low;
    const mfm = range === 0 ? 0 : ((b.close - b.low) - (b.high - b.close)) / range;
    cum += mfm * (b.volume ?? 0);
    ad.push(cum);
  }
  return trendScore(ad.slice(-lookback));
}

const value = (b) => (b.value > 0 ? b.value : (b.volume ?? 0) * b.close);
function avgValue(bars, n) { const s = bars.slice(-n); return s.length ? s.reduce((a, b) => a + value(b), 0) / s.length : 0; }

/** Thành phần của một mã tại phiên cuối của chuỗi; `benchByDate` = Map ngày -> điểm VN-Index. */
export function tickerInputs(ticker, bars, benchByDate, { minValue = TOP20_MIN_VALUE } = {}) {
  if (bars.length < 64) return null;
  const e = bars.length - 1, s = e - 63;
  const b1 = benchByDate.get(bars[e].date), b0 = benchByDate.get(bars[s].date);
  const rs3m = b1 > 0 && b0 > 0 && bars[s].close > 0 ? ((bars[e].close / bars[s].close) - (b1 / b0)) * 100 : null;
  const v20 = avgValue(bars, 20), vLong = avgValue(bars, Math.min(250, bars.length)), v60 = avgValue(bars, 60);
  return {
    ticker, lastDate: bars[e].date, bars: bars.length,
    rs3m: r1(rs3m), volumeSpikeRatio: vLong > 0 ? r2(v20 / vLong) : null,
    pvtScore: pvtTrend(bars), adScore: adTrend(bars),
    avgValue60: Math.round(v60), liquid: v60 >= minValue,
  };
}

/** Toàn universe. Mã có phiên cuối cũ hơn VN-Index > 5 phiên lịch bị đánh dấu stale (không xếp hạng). */
export function buildTop20Inputs({ seriesOf, benchBars, now = Date.now }) {
  const benchByDate = new Map(benchBars.map((b) => [b.date, b.close]));
  const dataAsOf = benchBars.at(-1)?.date ?? null;
  const staleBefore = dataAsOf ? new Date(Date.parse(dataAsOf) - 5 * 864e5).toISOString().slice(0, 10) : null;
  const tickers = [];
  for (const [t, bars] of seriesOf) {
    const x = tickerInputs(t, bars, benchByDate);
    if (x) tickers.push({ ...x, stale: Boolean(staleBefore && x.lastDate < staleBefore) });
  }
  tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return {
    engine: TOP20_INPUTS_ENGINE, dataAsOf, builtAt: new Date(now()).toISOString(), priceBasis: "ADJUSTED_CUMULATIVE",
    minValue: TOP20_MIN_VALUE, count: tickers.length, liquid: tickers.filter((x) => x.liquid && !x.stale).length, tickers,
  };
}
