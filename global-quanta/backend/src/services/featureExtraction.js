// Lớp định lượng của /api/scan (chế độ vision) — chỉ tính từ nến THẬT đã lấy ở bước trước.
// Volume Profile POC: mức giá có khối lượng lớn nhất trong 120 phiên gần nhất (40 vùng giá, khối lượng mỗi nến chia đều theo
// biên độ cao–thấp của nến). Dòng lệnh chủ động, vùng thanh khoản, tương quan liên thị trường: chưa có nguồn -> null, ghi rõ lý do.
// Trước 05/11/2026 file này sinh các giá trị đó bằng Math.random() — đã bỏ.

const LOOKBACK = 120;
const BINS = 40;

/** POC theo khối lượng phân bổ đều trên biên độ của từng nến. Trả null khi thiếu dữ liệu. */
export function volumeProfilePoc(candles, { lookback = LOOKBACK, bins = BINS } = {}) {
  const rows = (candles ?? []).slice(-lookback).filter((c) => c.high > 0 && c.low > 0 && c.high >= c.low && c.volume > 0);
  if (rows.length < 20) return null;
  const lo = Math.min(...rows.map((c) => c.low)), hi = Math.max(...rows.map((c) => c.high));
  if (!(hi > lo)) return null;
  const step = (hi - lo) / bins, vol = new Float64Array(bins);
  for (const c of rows) {
    const a = Math.min(bins - 1, Math.floor((c.low - lo) / step)), b = Math.min(bins - 1, Math.floor((c.high - lo) / step));
    const share = c.volume / (b - a + 1);
    for (let k = a; k <= b; k++) vol[k] += share;
  }
  let best = 0;
  for (let k = 1; k < bins; k++) if (vol[k] > vol[best]) best = k;
  return Math.round((lo + (best + 0.5) * step) * 100) / 100;
}

export function extractQuantFeatures(candles) {
  return {
    volume_profile_poc: volumeProfilePoc(candles),
    order_flow_bias: null,
    liquidity_pools: null,
    correlation_flag: null,
    source: "Nến ngày thật (Gateway): POC 120 phiên. Dòng lệnh chủ động, vùng thanh khoản, tương quan liên thị trường: chưa có nguồn, để trống.",
  };
}
