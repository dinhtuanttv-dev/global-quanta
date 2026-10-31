// Trạng thái thị trường MS-r1 (Tài liệu Trading Matrix, mục 4.1–4.5). Hàm thuần, chỉ dùng dữ liệu đến thời điểm t.
//   Độ rộng hợp nhất, McClellan, khoảng cách tham gia · Yang–Zhang · dòng tiền theo thanh khoản · số trụ hiệu dụng · bản đồ 2 trục.
// Đây là số đo mô tả hiện tại, không phải tín hiệu dự báo. Thiếu dữ liệu thì trả null, không điền số thay thế.
export const STATE_RULE = "MS-r1";
export const Z_WINDOW = 250;
export const Z_MIN = 60;
export const Z_CLIP = 4;
export const ZONE_BUFFER = 0.25;
export const YZ_WINDOW = 20;
const MIN_HISTORY = 50;
const PATH_LEN = 60;

const num = (x) => typeof x === "number" && Number.isFinite(x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 2) => (num(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
export function median(xs) {
  const v = xs.filter(num).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function sampleVar(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/** z dựa trên trung vị và MAD của cửa sổ TRƯỚC t, chặn ±4 nên một ngày cực đoan không làm méo thang. */
export function robustZSeries(series, { window = Z_WINDOW, minObs = Z_MIN, clip = Z_CLIP } = {}) {
  return series.map((x, i) => {
    if (!num(x)) return null;
    const prior = series.slice(Math.max(0, i - window), i).filter(num);
    if (prior.length < minObs) return null;
    const med = median(prior);
    const mad = median(prior.map((v) => Math.abs(v - med)));
    if (!(mad > 0)) return null;
    return Math.max(-clip, Math.min(clip, (x - med) / (1.4826 * mad)));
  });
}

/** Phân vị trong cửa sổ TRƯỚC t: tỷ lệ phiên có giá trị nhỏ hơn hoặc bằng x. */
export function priorPercentile(series, { window = 250, minObs = Z_MIN } = {}) {
  return series.map((x, i) => {
    if (!num(x)) return null;
    const prior = series.slice(Math.max(0, i - window), i).filter(num);
    return prior.length < minObs ? null : (prior.filter((v) => v <= x).length / prior.length) * 100;
  });
}

function emaSeries(xs, span) {
  const k = 2 / (span + 1);
  let cur = null;
  return xs.map((x) => { if (!num(x)) return cur; cur = cur == null ? x : cur + k * (x - cur); return cur; });
}
/** Dao động McClellan chuẩn hoá theo số mã: EMA19 − EMA39 của 1000 × (tăng − giảm) / (tăng + giảm). */
export function mcClellan(rows) {
  const r = rows.map((x) => (x.adv + x.dec > 0 ? (1000 * (x.adv - x.dec)) / (x.adv + x.dec) : null));
  const a = emaSeries(r, 19), b = emaSeries(r, 39);
  return r.map((_, i) => (num(a[i]) && num(b[i]) ? a[i] - b[i] : null));
}

/** Biến động Yang–Zhang năm hoá (%): gồm khoảng trống qua đêm, thân nến và biên độ Rogers–Satchell. */
export function yangZhangSeries(bars, n = YZ_WINDOW) {
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const valid = (b) => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0;
  return bars.map((_, i) => {
    if (i < n) return null;
    const win = bars.slice(i - n + 1, i + 1);
    if (!win.every(valid) || !valid(bars[i - n])) return null;
    const o = [], c = [], rs = [];
    win.forEach((b, j) => {
      const prev = j === 0 ? bars[i - n] : win[j - 1];
      o.push(Math.log(b.open / prev.close));
      c.push(Math.log(b.close / b.open));
      rs.push(Math.log(b.high / b.close) * Math.log(b.high / b.open) + Math.log(b.low / b.close) * Math.log(b.low / b.open));
    });
    const v = sampleVar(o) + k * sampleVar(c) + (1 - k) * mean(rs);
    return v >= 0 ? Math.sqrt(v * 252) * 100 : null;
  });
}

/** Số trụ hiệu dụng: (Σ|c|)² / Σc². Một mã quyết định hết thì bằng 1; n mã đóng góp như nhau thì bằng n. */
export function effectiveCount(contributions) {
  const a = contributions.filter(num).map(Math.abs);
  const s = a.reduce((x, y) => x + y, 0), q = a.reduce((x, y) => x + y * y, 0);
  return q > 0 ? (s * s) / q : null;
}

/** Bảng theo ngày của một phạm vi. Cùng điều kiện với dailyBreadth: có giao dịch tại t và từ 50 phiên lịch sử trở lên. */
export function panelByDate(bySymbol, dates) {
  const at = new Map(dates.map((d) => [d, { date: d, n: 0, up20: 0, up50: 0, n200: 0, up200: 0, adv: 0, dec: 0, r5: [], value: 0, foreign: 0 }]));
  const px = (r) => r.closeAdj ?? r.close;
  for (const rows of bySymbol.values()) {
    let s20 = 0, s50 = 0, s200 = 0;
    rows.forEach((r, i) => {
      const p = px(r);
      s20 += p; s50 += p; s200 += p;
      if (i >= 20) s20 -= px(rows[i - 20]);
      if (i >= 50) s50 -= px(rows[i - 50]);
      if (i >= 200) s200 -= px(rows[i - 200]);
      const a = at.get(r.date);
      if (!a) return;
      a.value += r.value ?? r.close * (r.volume ?? 0);
      a.foreign += (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0);
      if (i >= 5 && px(rows[i - 5]) > 0) a.r5.push((p / px(rows[i - 5]) - 1) * 100);
      if (i + 1 < MIN_HISTORY) return;
      a.n++;
      if (p > s20 / 20) a.up20++;
      if (p > s50 / 50) a.up50++;
      if (i + 1 >= 200) { a.n200++; if (p > s200 / 200) a.up200++; }
      const ref = r.refPrice > 0 ? r.refPrice : rows[i - 1]?.close;
      if (ref > 0) { const ret = r.close / ref - 1; if (ret > 1e-9) a.adv++; else if (ret < -1e-9) a.dec++; }
    });
  }
  return dates.map((d) => at.get(d));
}

/** Số trụ hiệu dụng theo ngày, trên toàn bộ mã HOSE có số cổ phiếu. Dùng số cổ phiếu mới nhất cho cả chuỗi. */
export function neffByDate(hoseBySymbol, dates, shares) {
  const out = new Map(dates.map((d) => [d, []]));
  for (const [sym, rows] of hoseBySymbol) {
    const n = shares?.get?.(sym);
    if (!(n > 0)) continue;
    rows.forEach((r, i) => {
      const a = out.get(r.date);
      const ref = r.refPrice > 0 ? r.refPrice : rows[i - 1]?.close;
      if (a && ref > 0 && r.close > 0) a.push((r.close - ref) * n);
    });
  }
  return dates.map((d) => effectiveCount(out.get(d)));
}

const avgAtLeast = (xs, min) => { const v = xs.filter(num); return v.length >= min ? mean(v) : null; };

/** Trục X (xu hướng và tham gia), trục Y (căng thẳng). Trọng số đều để không khớp theo quá khứ. */
export function buildStateSeries({ panel, indexBars, neff = null, ldZ = null }) {
  const byDate = new Map(indexBars.map((b, i) => [b.date, i]));
  const yz = yangZhangSeries(indexBars);
  const pick = (arr) => panel.map((p) => { const i = byDate.get(p.date); return i == null ? null : arr[i]; });
  const closes = indexBars.map((b) => b.close);
  const ret = (h) => indexBars.map((_, i) => (i >= h && closes[i - h] > 0 ? (closes[i] / closes[i - h] - 1) * 100 : null));
  const idx20 = pick(ret(20)), idx5 = pick(ret(5)), idx1 = pick(ret(1)), sigma = pick(yz);
  const b20 = panel.map((p) => (p.n ? (p.up20 / p.n) * 100 : null));
  const b50 = panel.map((p) => (p.n ? (p.up50 / p.n) * 100 : null));
  const b200 = panel.map((p) => (p.n200 ? (p.up200 / p.n200) * 100 : null));
  const mo = mcClellan(panel);
  const db5 = b20.map((v, i) => (i >= 5 && num(v) && num(b20[i - 5]) ? v - b20[i - 5] : null));
  const ddb = b20.map((v, i) => { const w = b20.slice(Math.max(0, i - 5), i + 1).filter(num); return i >= 5 && num(v) && w.length >= 6 ? v - Math.max(...w) : null; });
  const med5 = panel.map((p) => median(p.r5));
  const pg5 = idx5.map((v, i) => (num(v) && num(med5[i]) ? v - med5[i] : null));
  const fnr = (h) => panel.map((_, i) => {
    if (i < h - 1) return null;
    const w = panel.slice(i - h + 1, i + 1);
    const val = w.reduce((a, x) => a + x.value, 0);
    return val > 0 ? (w.reduce((a, x) => a + x.foreign, 0) / val) * 100 : null;
  });
  const fnr1 = fnr(1), fnr5 = fnr(5);
  const z = (arr) => robustZSeries(arr);
  const zIdx = z(idx20), zB = z(b20), zMo = z(mo), zSigma = z(sigma), zDrop = z(db5.map((v) => (num(v) ? -v : null))), zFnr = z(fnr5);
  const zLd = ldZ ? z(panel.map((p) => ldZ.get(p.date) ?? null)) : panel.map(() => null);
  const conc = neff ? panel.map((_, i) => (num(neff[i]) && neff[i] > 0 ? 1 / neff[i] : null)) : panel.map(() => null);
  const zConc = z(conc);
  const yzPct = priorPercentile(sigma);
  const pgPct = priorPercentile(pg5);
  return panel.map((p, i) => {
    const flow = avgAtLeast([zFnr[i], zLd[i]], 1);
    return {
      date: p.date, n: p.n, b20: b20[i], b50: b50[i], b200: b200[i], mo: mo[i], moZ: zMo[i], db5: db5[i], ddb: ddb[i], med5: med5[i], pg5: pg5[i], pgPct: pgPct[i],
      idx1: idx1[i], idx5: idx5[i], idx20: idx20[i], sigma: sigma[i], yzPct: yzPct[i], fnr1: fnr1[i], fnr5: fnr5[i], foreign: p.foreign, value: p.value, fnrZ: zFnr[i], ldZ: zLd[i], flow,
      neff: neff ? neff[i] : null,
      x: avgAtLeast([zIdx[i], zB[i], zMo[i], flow], 3),
      y: avgAtLeast([zSigma[i], zDrop[i], zConc[i]], 2),
    };
  });
}

/** Vùng đệm ±0,25 quanh trục để nhãn không đổi liên tục khi điểm nằm sát trục. */
export function zoneOf(x, y) {
  if (!num(x) || !num(y)) return null;
  const side = x > ZONE_BUFFER ? "up" : x < -ZONE_BUFFER ? "down" : "mid";
  const stress = y > ZONE_BUFFER ? "high" : y < -ZONE_BUFFER ? "low" : "mid";
  return { side, stress, id: `${side}-${stress}` };
}
export const volBand = (pct) => (!num(pct) ? null : pct < 25 ? "thấp" : pct <= 75 ? "bình thường" : "cao");
const REGIME_VI = { UPTREND: "Xu hướng tăng", DOWNTREND: "Xu hướng giảm", SIDEWAY: "Đi ngang", TRANSITION: "Chuyển pha" };
const pctVi = (v) => `${(Math.round(v * 10) / 10).toLocaleString("vi-VN")}%`;

/** Dòng kết luận: mỗi cụm nối với một tab. Thiếu số thì bỏ cụm đó, không viết thay. */
export function headlineOf({ regimeLabel, s, fnrIsForeign = true }) {
  const out = [];
  if (REGIME_VI[regimeLabel]) out.push({ key: "trend", tab: "scenario", text: REGIME_VI[regimeLabel] });
  const vb = volBand(s?.yzPct);
  if (vb) out.push({ key: "vol", tab: "scenario", text: `biến động ${vb}` });
  if (num(s?.b20)) out.push({ key: "breadth", tab: "sectors", text: `độ rộng ${pctVi(s.b20)}` });
  if (fnrIsForeign && num(s?.fnr5)) out.push({ key: "flow", tab: "flow", text: Math.abs(s.fnr5) < 0.05 ? "khối ngoại cân bằng" : s.fnr5 > 0 ? "khối ngoại mua ròng" : "khối ngoại bán ròng" });
  if (num(s?.neff)) out.push({ key: "concentration", tab: "index", text: `${Math.round(s.neff)} trụ hiệu dụng` });
  return out;
}

const slim = (s) => ({
  date: s.date, x: round(s.x), y: round(s.y), b20: round(s.b20, 1), b50: round(s.b50, 1), b200: round(s.b200, 1), mo: round(s.mo, 1), moZ: round(s.moZ), pg5: round(s.pg5), db5: round(s.db5, 1),
  idx1: round(s.idx1), idx5: round(s.idx5), idx20: round(s.idx20), sigma: round(s.sigma, 1), yzPct: round(s.yzPct, 0), fnr1: round(s.fnr1), fnr5: round(s.fnr5), fnrZ: round(s.fnrZ), ldZ: round(s.ldZ), flow: round(s.flow),
  foreign: s.foreign == null ? null : Math.round(s.foreign), value: s.value == null ? null : Math.round(s.value), neff: round(s.neff, 1), n: s.n,
});

/** Tài liệu gửi giao diện. changes so hai phiên gần nhất, chỉ gồm số có đủ ở cả hai phiên. */
export function stateDoc({ series, regimeLabel }) {
  const usable = series.filter((s) => s.date);
  const cur = usable.at(-1), prev = usable.at(-2);
  if (!cur) return null;
  const zone = zoneOf(cur.x, cur.y), zonePrev = prev ? zoneOf(prev.x, prev.y) : null;
  const delta = (k) => (prev && num(cur[k]) && num(prev[k]) ? cur[k] - prev[k] : null);
  return {
    rule: STATE_RULE, asOf: cur.date, x: round(cur.x), y: round(cur.y), zone, zoneChanged: Boolean(zone && zonePrev && zone.id !== zonePrev.id), zonePrev,
    headline: headlineOf({ regimeLabel, s: cur }), current: slim(cur), previous: prev ? slim(prev) : null,
    deltas: { b20: round(delta("b20"), 1), b50: round(delta("b50"), 1), mo: round(delta("mo"), 1), sigma: round(delta("sigma"), 1), fnr5: round(delta("fnr5")), neff: round(delta("neff"), 1), x: round(delta("x")), y: round(delta("y")) },
    path: usable.slice(-PATH_LEN).map(slim),
    method: { sigma: "Yang–Zhang 20 phiên", zWindow: Z_WINDOW, buffer: ZONE_BUFFER },
  };
}
