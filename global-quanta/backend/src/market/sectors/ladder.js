// Thang kỳ hạn ngành (LD1): sáu nấc 1, 5, 20, 40, 65, 130 phiên (ba nấc cuối = 8, 13, 26 tuần), một công thức trên cùng chỉ số ngành của RRG.
//   RS_h = ln(Ngành_t / Ngành_t−h) − ln(VNINDEX_t / VNINDEX_t−h)
//   Z_h  = RS_h / (σ·√h), σ = độ lệch chuẩn lợi suất tương đối ngày trong 120 phiên -> so được giữa các kỳ và các ngành.
//   B_h  = % mã của ngành vượt VN-Index trong đúng h phiên, kèm khoảng Wilson 95%.
//   Cấu trúc: ngắn = Z5, trung = TB(Z20, Z40), dài = TB(Z65, Z130); mỗi chân có vùng đệm (vào ±0,5, ra ±0,25) để nhãn không nhảy.
// Chỉ MÔ TẢ: kiểm tra khám phá 01/11 không kỳ nào dự báo được rõ ràng. Hàm thuần, không gọi nguồn ngoài.
export const LADDER_ENGINE = "sector-ladder/LD1";
export const SECTOR_LADDER_KV = "sectors:ladder";
export const LADDER_HORIZONS = Object.freeze([1, 5, 20, 40, 65, 130]);
export const LADDER_PARAMS = Object.freeze({ sigmaWindow: 120, sigmaMin: 60, enter: 0.5, exit: 0.25, warm: 60, minBreadth: 3 });
export const STRUCTURE_VI = Object.freeze({ UP_ALIGNED: "Đồng thuận tăng", DOWN_ALIGNED: "Đồng thuận giảm", BOUNCE: "Hồi trong xu hướng yếu", PULLBACK: "Điều chỉnh trong xu hướng mạnh", MIXED: "Chưa rõ", INSUFFICIENT: "Chưa đủ lịch sử" });

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Khoảng Wilson 95% cho tỷ lệ k/n, đơn vị %. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return { lo: null, hi: null };
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: r2(Math.max(0, (c - m) / d) * 100), hi: r2(Math.min(1, (c + m) / d) * 100) };
}

/** Trạng thái một chân: đang ở phía nào thì giữ tới khi rơi qua ngưỡng ra; sang phía kia khi vượt ngưỡng vào. */
export function nextLeg(prev, v, { enter = LADDER_PARAMS.enter, exit = LADDER_PARAMS.exit } = {}) {
  if (v == null) return prev;
  if (v >= enter) return 1;
  if (v <= -enter) return -1;
  if (prev === 1 && v < exit) return 0;
  if (prev === -1 && v > -exit) return 0;
  return prev;
}

/** Nhãn từ ba chân; xu hướng dài là khung, ngắn và trung cho biết đang đi cùng hay ngược. */
export function structureKey(short, mid, long) {
  if (long === 1) return short === -1 ? "PULLBACK" : mid >= 0 && (mid === 1 || short === 1) ? "UP_ALIGNED" : "MIXED";
  if (long === -1) return short === 1 ? "BOUNCE" : mid <= 0 && (mid === -1 || short === -1) ? "DOWN_ALIGNED" : "MIXED";
  return "MIXED";
}

/** Chênh lệch log tích luỹ ngành − VN-Index theo lịch VN-Index; phiên ngành thiếu dữ liệu = NaN. */
function relativeCurve(indexSeries, benchBars) {
  const byDate = new Map(indexSeries.map((b) => [b.date, Number(b.close)]));
  return benchBars.map((b) => { const s = byDate.get(b.date); return s > 0 && b.close > 0 ? Math.log(s) - Math.log(b.close) : NaN; });
}

function sigmaAt(C, i, p) {
  const v = [];
  for (let k = Math.max(1, i - p.sigmaWindow + 1); k <= i; k++) { const d = C[k] - C[k - 1]; if (Number.isFinite(d)) v.push(d); }
  if (v.length < p.sigmaMin) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return s > 0 ? s : null;
}

/** Z_h tại vị trí i; null nếu thiếu dữ liệu. Không nhìn trước: chỉ dùng dữ liệu tới i. */
function zAt(C, i, h, sigma) {
  if (i - h < 0 || !sigma) return null;
  const rs = C[i] - C[i - h];
  return Number.isFinite(rs) ? rs / (sigma * Math.sqrt(h)) : null;
}
const avg2 = (a, b) => (a == null || b == null ? null : (a + b) / 2);

/**
 * @param indexSeries [{date, close}] chỉ số ngành (cùng chỉ số của RRG)
 * @param members     [{ticker, bars}] giá điều chỉnh
 * @param benchBars   nến VN-Index cũ -> mới
 */
export function computeSectorLadder({ indexSeries, members, benchBars, p = LADDER_PARAMS }) {
  const C = relativeCurve(indexSeries, benchBars), t = benchBars.length - 1;
  const sigma = t >= 0 ? sigmaAt(C, t, p) : null;
  const closes = members.map((m) => new Map(m.bars.map((b) => [b.date, Number(b.close)])));
  const rungs = LADDER_HORIZONS.map((h) => {
    const rs = t - h >= 0 ? C[t] - C[t - h] : NaN;
    let k = 0, n = 0;
    if (t - h >= 0) {
      const dNow = benchBars[t].date, dThen = benchBars[t - h].date, bench = Math.log(benchBars[t].close / benchBars[t - h].close);
      for (const m of closes) {
        const a = m.get(dNow), b = m.get(dThen);
        if (a > 0 && b > 0) { n++; if (Math.log(a / b) > bench) k++; }
      }
    }
    const enough = n >= p.minBreadth, ci = enough ? wilson(k, n) : { lo: null, hi: null };
    return { h, rs: Number.isFinite(rs) ? r2(rs * 100) : null, z: r2(zAt(C, t, h, sigma)), beat: enough ? r2((k / n) * 100) : null, n, lo: ci.lo, hi: ci.hi };
  });
  // Đi qua các phiên gần đây để vùng đệm có trạng thái trước đó; luôn cùng độ dài nên kết quả tái lập được.
  let short = 0, mid = 0, long = 0, last = null;
  for (let i = Math.max(0, t - p.warm + 1); i <= t; i++) {
    const s = sigmaAt(C, i, p);
    const vs = zAt(C, i, 5, s), vm = avg2(zAt(C, i, 20, s), zAt(C, i, 40, s)), vl = avg2(zAt(C, i, 65, s), zAt(C, i, 130, s));
    short = nextLeg(short, vs, p); mid = nextLeg(mid, vm, p); long = nextLeg(long, vl, p);
    last = { vs, vm, vl };
  }
  const ok = last && last.vs != null && last.vm != null && last.vl != null;
  const key = ok ? structureKey(short, mid, long) : "INSUFFICIENT";
  return {
    asOf: benchBars[t]?.date ?? null, sigmaDailyPct: r2(sigma == null ? null : sigma * 100), rungs,
    structure: { key, label: STRUCTURE_VI[key], short: ok ? short : null, mid: ok ? mid : null, long: ok ? long : null },
  };
}

/** Bảng đối chiếu: mỗi ngành ICB cấp 2 gồm những ngành nào của bộ phân ngành Siêu Quét, để lọc bảng theo đúng danh sách mã. */
export function buildCrosswalk({ tickers, icb, scannerMap = {} }) {
  const out = new Map();
  let classified = 0, withScanner = 0;
  for (const t of tickers) {
    const code = icb.symbols[t]?.l2; if (!code) continue;
    classified++;
    if (!out.has(code)) out.set(code, new Map());
    const name = scannerMap[t]?.[1] ?? null;
    if (name) { withScanner++; out.get(code).set(name, (out.get(code).get(name) ?? 0) + 1); }
  }
  const names = new Map((icb.levels[2] ?? []).map((s) => [s.code, s.name]));
  return {
    classified, withScanner,
    sectors: [...out].map(([code, m]) => ({ code, name: names.get(code) ?? code, scanner: [...m].map(([industry, count]) => ({ industry, count })).sort((a, b) => b.count - a.count) })).sort((a, b) => a.code.localeCompare(b.code)),
  };
}
