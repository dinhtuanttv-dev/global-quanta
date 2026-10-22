// Trading Matrix M2 — thống kê ngành (heatmap toạ độ, spec §6.7) + mã biến động đáng chú ý (spec §6.8). Hàm thuần.
//   Ngành: CÙNG phân ngành 2 cấp với bảng Siêu Quét (KV scanner:taxonomy: mã -> [nhóm ngành, ngành]) -> bấm ô ngành lọc đúng bảng.
//   Trục X = sức mạnh tương đối so VN-Index (trung vị lợi suất mã trong ngành − lợi suất VN-Index, theo kỳ 1 / 5 / 20 phiên).
//   Trục Y = độ rộng ngành (% mã trên MA20). Kích thước = giá trị giao dịch TB 20 phiên. Cờ: độ rộng ngành giảm mạnh / biến động bất thường.
//   KHÔNG có trọng số chỉ số (SSI chỉ trả thành phần) -> "Mã biến động đáng chú ý", không gọi là "tác động chỉ số".
export const HORIZONS = [1, 5, 20];
const MIN_SECTOR = 3;

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const median = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const px = (r) => r.closeAdj ?? r.close;

/** Lợi suất h phiên của chuỗi kết thúc ở chỉ số i (null nếu thiếu). */
const retAt = (rows, i, h) => (i - h >= 0 && px(rows[i - h]) > 0 ? px(rows[i]) / px(rows[i - h]) - 1 : null);
const aboveMa20 = (rows, i) => { if (i < 19) return null; const c = rows.slice(i - 19, i + 1).map(px); return c[19] > mean(c); };

/**
 * @param bySymbol Map(mã -> nến ngày cũ -> mới) của phạm vi
 * @param asOf     phiên đánh giá
 * @param indexBars nến VN-Index (cũ -> mới)
 * @param taxonomy { [mã]: [nhóm, ngành] }
 * @param smart    Map(mã -> Smart Score) của lần quét cùng phiên (có thể rỗng)
 */
export function sectorStats({ bySymbol, asOf, indexBars, taxonomy = {}, smart = new Map() }) {
  const iIdx = indexBars.findIndex((b) => b.date === asOf);
  const idxRet = Object.fromEntries(HORIZONS.map((h) => [h, iIdx >= h ? indexBars[iIdx].close / indexBars[iIdx - h].close - 1 : null]));
  const groups = new Map();
  let unclassified = 0;
  for (const [sym, rows] of bySymbol) {
    const tax = taxonomy[sym];
    if (!tax) { unclassified++; continue; }
    const [group, industry] = tax;
    const key = industry;
    if (!groups.has(key)) groups.set(key, { industry, group, members: [] });
    const i = rows.length - 1;
    const g = groups.get(key);
    if (!rows.length || rows[i].date !== asOf || i < 20) { g.members.push({ sym, eligible: false }); continue; }
    const value20 = mean(rows.slice(-20).map((r) => r.value ?? r.close * r.volume));
    g.members.push({
      sym, eligible: true,
      ret: Object.fromEntries(HORIZONS.map((h) => [h, retAt(rows, i, h)])),
      above: aboveMa20(rows, i), above5: aboveMa20(rows, i - 5),
      value20, foreign5: rows.slice(-5).reduce((a, r) => a + (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0), 0),
      range: px(rows[i]) > 0 ? (rows[i].high - rows[i].low) / rows[i].close : null,
      rangeAvg: mean(rows.slice(-21, -1).map((r) => (r.close > 0 ? (r.high - r.low) / r.close : null))),
      smart: smart.get(sym) ?? null,
    });
  }
  const sectors = [];
  for (const g of groups.values()) {
    const el = g.members.filter((m) => m.eligible);
    if (el.length < MIN_SECTOR) continue;
    const breadth = (el.filter((m) => m.above).length / el.length) * 100;
    const b5 = el.filter((m) => m.above5 != null);
    const breadth5 = b5.length ? (b5.filter((m) => m.above5).length / b5.length) * 100 : null;
    const rangeRatio = median(el.map((m) => (m.rangeAvg > 0 ? m.range / m.rangeAvg : null)));
    const smarts = el.map((m) => m.smart).filter(Number.isFinite);
    const flags = [];
    if (breadth5 != null && breadth5 - breadth >= 25) flags.push({ id: "BREADTH_DROP", text: `Độ rộng ngành giảm ${r1(breadth5 - breadth)} điểm trong 5 phiên` });
    if (rangeRatio != null && rangeRatio >= 2) flags.push({ id: "RANGE_EXPANSION", text: `Biên độ phiên gấp ${r1(rangeRatio)} lần TB 20 phiên (trung vị)` });
    sectors.push({
      industry: g.industry, group: g.group, count: g.members.length, eligible: el.length,
      rs: Object.fromEntries(HORIZONS.map((h) => [h, idxRet[h] == null ? null : r2((median(el.map((m) => m.ret[h])) - idxRet[h]) * 100)])),
      medianReturn: Object.fromEntries(HORIZONS.map((h) => [h, r2(median(el.map((m) => m.ret[h])) * 100)])),
      breadth: r1(breadth), breadth5: r1(breadth5),
      value20: Math.round(el.reduce((a, m) => a + (m.value20 ?? 0), 0)),
      foreign5: Math.round(el.reduce((a, m) => a + m.foreign5, 0)),
      avgSmart: smarts.length ? r1(mean(smarts)) : null, smartCoverage: r2(smarts.length / el.length),
      rangeRatio: r2(rangeRatio), flags,
    });
  }
  sectors.sort((a, b) => b.value20 - a.value20);
  return {
    asOf, horizons: HORIZONS, indexReturn: Object.fromEntries(HORIZONS.map((h) => [h, r2(idxRet[h] == null ? null : idxRet[h] * 100)])),
    sectors, unclassified, minSectorSize: MIN_SECTOR,
    definition: "X: trung vị lợi suất các mã trong ngành − lợi suất VN-Index (điểm %). Y: % mã của ngành trên MA20. Kích thước: tổng giá trị giao dịch TB 20 phiên. Ngành < 3 mã đủ dữ liệu không hiển thị.",
  };
}

/**
 * Mã biến động đáng chú ý của phiên (đã chốt): lọc thanh khoản (GTGD TB20 ≥ trung vị phạm vi), xếp tăng / giảm mạnh nhất;
 * GTGD đột biến = GTGD phiên / TB20 ≥ 2. Không có trọng số chỉ số -> không phải đóng góp điểm số.
 */
export function notableMovers({ bySymbol, asOf, taxonomy = {}, top = 8 }) {
  const rows = [];
  for (const [sym, list] of bySymbol) {
    const i = list.length - 1;
    if (i < 21 || list[i].date !== asOf) continue;
    const r = list[i], ref = r.refPrice > 0 ? r.refPrice : list[i - 1].close;
    if (!(ref > 0)) continue;
    const v20 = mean(list.slice(-21, -1).map((x) => x.value ?? x.close * x.volume));
    rows.push({
      symbol: sym, industry: taxonomy[sym]?.[1] ?? null, close: r.close, ret: r2((r.close / ref - 1) * 100), value: r.value ?? null,
      valueRatio: v20 > 0 && r.value != null ? r2(r.value / v20) : null, avgValue20: v20 ? Math.round(v20) : null,
      atCeiling: r.ceiling > 0 && r.close >= r.ceiling, atFloor: r.floor > 0 && r.close <= r.floor,
      foreignNet: (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0),
    });
  }
  const liq = median(rows.map((x) => x.avgValue20));
  const liquid = rows.filter((x) => liq == null || (x.avgValue20 ?? 0) >= liq);
  return {
    asOf, eligible: rows.length, liquidityFloor: liq ? Math.round(liq) : null,
    gainers: [...liquid].sort((a, b) => b.ret - a.ret).filter((x) => x.ret > 0).slice(0, top),
    losers: [...liquid].sort((a, b) => a.ret - b.ret).filter((x) => x.ret < 0).slice(0, top),
    valueSpikes: rows.filter((x) => (x.valueRatio ?? 0) >= 2).sort((a, b) => b.valueRatio - a.valueRatio).slice(0, top),
    label: "Mã biến động đáng chú ý",
    note: "Không có trọng số chỉ số theo ngày hiệu lực (SSI chỉ cung cấp danh sách thành phần) — đây KHÔNG phải mức đóng góp vào VN-Index.",
  };
}
