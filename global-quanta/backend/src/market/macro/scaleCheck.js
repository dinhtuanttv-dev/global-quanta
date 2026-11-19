// V0 (19/11/2026) — Cổng chất lượng cho kho số liệu vĩ mô: phát hiện điểm LỆCH THANG ĐO (×100, ÷10.000…).
// Đã đo trên production: VN-Index ×100 (07–12/2019), VN100 ×100 (2019), tỷ giá Yahoo VND=X ÷10.000 ở 5 tháng 2016–2017.
// So với TRUNG VỊ CỦA CẢ CHUỖI, ngưỡng ×20: lỗi thang là ×100 / ÷10.000, còn biến động thật của các chuỗi mức trong kho nằm trong ×5
// quanh trung vị (VN-Index 10 năm, tỷ giá, DXY, Brent kể cả 04/2020). Không dùng cửa sổ cục bộ: đoạn lỗi 12 tháng ngay đầu chuỗi
// (VN100 2019) làm trung vị cục bộ lệch và bắt nhầm điểm đúng. Giới hạn: phát hiện được khi điểm lỗi ít hơn nửa chuỗi.
// Chỉ áp cho chuỗi mức dương (giá, chỉ số, tỷ giá). Chuỗi tỷ lệ (CPI %, lãi suất) có thể gần 0 hoặc âm -> không dùng tỷ số.

export const MAX_SCALE_RATIO = 20;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param {{period:string, value:number}[]} points một chuỗi, mỗi kỳ một điểm, tăng dần theo kỳ
 * @returns {Map<string, {value:number, localMedian:number, ratio:number}>} các kỳ lệch thang
 */
export function scaleOutliers(points, { maxRatio = MAX_SCALE_RATIO } = {}) {
  const out = new Map();
  const pos = points.map((p) => p.value).filter((v) => v > 0);
  if (pos.length < 6) return out;
  const ref = median(pos);
  for (const p of points) {
    const ratio = p.value > 0 ? p.value / ref : 0;
    if (!(p.value > 0) || ratio > maxRatio || ratio < 1 / maxRatio) out.set(p.period, { value: p.value, median: ref, ratio });
  }
  return out.size * 2 < points.length ? out : new Map();
}

/**
 * Cách ly điểm lệch thang khỏi danh sách quan sát (mọi vintage của kỳ đó). Không sửa, không nội suy: kỳ bị cách ly trở thành
 * kỳ thiếu, engine bỏ qua; danh sách cách ly được trả ra để hiển thị (minh bạch).
 * @param {{seriesId,period,value,asOf,source?}[]} list
 * @param {(seriesId:string)=>boolean} isLevel chuỗi mức dương (áp kiểm tra tỷ số)
 */
export function quarantineScale(list, isLevel) {
  const bySeries = new Map();
  for (const o of list) {
    if (!isLevel(o.seriesId)) continue;
    const m = bySeries.get(o.seriesId) ?? new Map();
    const prev = m.get(o.period);
    if (!prev || o.asOf > prev.asOf) m.set(o.period, o); // bản mới nhất của mỗi kỳ
    bySeries.set(o.seriesId, m);
  }
  const held = [];
  const bad = new Set();
  for (const [seriesId, m] of bySeries) {
    const pts = [...m.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
    for (const [period, x] of scaleOutliers(pts)) {
      bad.add(`${seriesId}|${period}`);
      held.push({ seriesId, period, value: x.value, seriesMedian: Math.round(x.median * 100) / 100, source: m.get(period)?.source ?? null,
        reason: `Lệch thang đo ${x.ratio >= 1 ? `×${Math.round(x.ratio)}` : `÷${Math.round(1 / Math.max(x.ratio, 1e-12))}`} so với trung vị của chuỗi` });
    }
  }
  held.sort((a, b) => (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : a.period < b.period ? -1 : 1));
  return { keep: list.filter((o) => !bad.has(`${o.seriesId}|${o.period}`)), held };
}
