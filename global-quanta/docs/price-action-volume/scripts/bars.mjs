// Dựng nến ngày ĐIỀU CHỈNH LÙI từ OHLC danh nghĩa VNDirect: hệ số ngày t = basicPrice(t) / close(t−1) (≠ 1 ở ngày không hưởng quyền).
// Đơn vị: đồng. Loại phiên không có khớp lệnh (nmVolume = 0) khỏi chuỗi phân tích nhưng GIỮ ở cờ để biết (không bịa nến phẳng).
import fs from "node:fs";
// raw: [date, open, high, low, close, basicPrice, ceilingPrice, floorPrice, nmVolume, nmValue, floor]
export function loadBars(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = raw.filter((r) => r[1] > 0 && r[2] > 0 && r[3] > 0 && r[4] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = rows.length; if (!n) return null;
  const f = new Array(n).fill(1);
  for (let t = 1; t < n; t++) {
    const ref = rows[t][5], pc = rows[t - 1][4];
    const r = ref > 0 && pc > 0 ? ref / pc : 1;
    f[t] = Math.abs(r - 1) > 0.002 && r > 0.2 && r < 1.05 ? r : 1; // chỉ điều chỉnh khi tham chiếu giảm (cổ tức / chia tách); nhiễu làm tròn bỏ qua
  }
  const cum = new Array(n).fill(1);
  for (let t = n - 2; t >= 0; t--) cum[t] = cum[t + 1] * f[t + 1];
  const bars = [], meta = [];
  for (let t = 0; t < n; t++) {
    const r = rows[t], k = cum[t] * 1000;
    if (!(r[8] > 0)) continue;
    let o = r[1] * k, h = r[2] * k, l = r[3] * k, c = r[4] * k;
    h = Math.max(h, o, c); l = Math.min(l, o, c);
    bars.push({ date: r[0], open: o, high: h, low: l, close: c, volume: r[8] });
    meta.push({ value: r[9] ?? null, ceil: r[6] * k, floor: r[10], nominalClose: r[4] * 1000, factor: cum[t] });
  }
  return { bars, meta };
}
