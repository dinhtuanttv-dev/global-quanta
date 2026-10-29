// N0 (29/10/2026) — "ESA tin tức": phản ứng KHỐI LƯỢNG và GIÁ sau tin theo nghiên cứu sự kiện chuẩn.
//   Khối lượng bất thường — Campbell & Wasley (1996, "Measuring abnormal daily trading volume"): v_t = ln(1 + giá trị GD_t) (VND,
//   không méo khi chia tách cổ phiếu), mô hình thị trường v_t = a + b·m_t với m_t = ln(1 + giá trị GD toàn sàn), ước lượng OLS trên
//   cửa sổ [−120, −11] phiên trước tin (loại phiên quanh tin). AV_t = v_t − (a + b·m_t); thang σ = 1,4826·MAD phần dư (bền với đột
//   biến trong cửa sổ ước lượng, cùng chuẩn ESA R0). SAV_0 = AV_0/σ; CAV[0,k] = ΣAV; z = CAV/(σ√k).
//   Lợi suất bất thường — mô hình thị trường r_t = α + β·r_m,t (log, giá điều chỉnh), OLS cùng cửa sổ; σ_ε = độ lệch chuẩn phần dư;
//   CAR[0,k], SCAR = CAR/(σ_ε√k).
//   Phân loại (ngưỡng |z| ≥ 2 ≈ p < 0,05 hai phía, đặt trước): định giá lại (KL + giá) · hấp thụ (KL, giá đứng — gom/xả âm thầm) ·
//   chỉ giá (giá đi, KL thường) · bị bỏ qua · chờ phiên. Mô tả — CHƯA kiểm định khả năng dự báo.
export const AR_PARAMS = Object.freeze({ estFrom: -120, estTo: -11, minEst: 60, horizon: 3, z: 2 });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

/** OLS y = a + b·x -> { a, b, resid } (b = 0 khi x không đổi). */
export function ols(xs, ys) {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  return { a, b, resid: ys.map((y, i) => y - a - b * xs[i]) };
}

const valueOf = (r) => (Number(r.value) > 0 ? Number(r.value) : Number(r.volume) > 0 && Number(r.close) > 0 ? Number(r.volume) * Number(r.close) : null);
const priceOf = (r) => Number(r.closeAdj ?? r.close_adj ?? r.close) || null;

/** Phiên phản ứng đầu tiên của tin: tin trước 15:00 ngày giao dịch -> chính phiên đó; sau 15:00 / ngày nghỉ -> phiên kế tiếp. */
export function reactionIndex(rows, publishedAt) {
  const vn = new Date(Date.parse(publishedAt) + 7 * 3_600_000);
  const day = vn.toISOString().slice(0, 10);
  const afterClose = vn.getUTCHours() * 60 + vn.getUTCMinutes() >= 15 * 60;
  for (let i = 0; i < rows.length; i++) if (rows[i].date > day || (!afterClose && rows[i].date === day)) return i;
  return rows.length; // chưa có phiên phản ứng
}

/**
 * @param {{publishedAt: string}} item
 * @param {{date, close, closeAdj?, volume, value}[]} rows nến ngày của mã, tăng dần
 * @param {Map<string, {close: number, value: number|null}>} market VN-Index theo ngày (giá + giá trị GD toàn sàn)
 */
export function abnormalReaction(item, rows, market, p = AR_PARAMS) {
  if (!item?.publishedAt || !rows?.length) return null;
  const e0 = reactionIndex(rows, item.publishedAt);
  const base = { method: "CW96 log-value market model + market-model AR", sessions: 0, classification: "pending" };
  // Cửa sổ ước lượng: [e0 + estFrom, e0 + estTo]
  const est = [];
  for (let i = Math.max(1, e0 + p.estFrom); i <= e0 + p.estTo && i < rows.length; i++) {
    const r = rows[i], prev = rows[i - 1], m = market.get(r.date), mp = market.get(prev.date);
    const v = valueOf(r), pr = priceOf(r), pp = priceOf(prev);
    if (!m || !mp || !(m.value > 0) || !v || !pr || !pp || !(m.close > 0) || !(mp.close > 0)) continue;
    est.push({ v: Math.log1p(v), mv: Math.log1p(m.value), r: Math.log(pr / pp), rm: Math.log(m.close / mp.close) });
  }
  if (est.length < p.minEst) return { ...base, classification: "insufficient", estimation: { n: est.length, need: p.minEst } };
  const vm = ols(est.map((x) => x.mv), est.map((x) => x.v));
  const sv = 1.4826 * median(vm.resid.map((x) => Math.abs(x - median(vm.resid))));
  const rmod = ols(est.map((x) => x.rm), est.map((x) => x.r));
  const sr = Math.sqrt(rmod.resid.reduce((s, x) => s + x * x, 0) / Math.max(1, rmod.resid.length - 2));
  const avs = [], ars = [], days = [];
  for (let i = e0; i < Math.min(rows.length, e0 + p.horizon); i++) {
    const r = rows[i], prev = rows[i - 1], m = market.get(r.date), mp = prev ? market.get(prev.date) : null;
    const v = valueOf(r), pr = priceOf(r), pp = prev ? priceOf(prev) : null;
    if (!m || !(m.value > 0) || !v) break;
    avs.push(Math.log1p(v) - (vm.a + vm.b * Math.log1p(m.value)));
    ars.push(mp && pr && pp && m.close > 0 && mp.close > 0 ? Math.log(pr / pp) - (rmod.a + rmod.b * Math.log(m.close / mp.close)) : 0);
    days.push(r.date);
  }
  const k = avs.length;
  const est0 = { n: est.length, beta: round(rmod.b, 3), volumeBeta: round(vm.b, 3), sigmaVolume: round(sv, 4), sigmaReturn: round(sr, 5) };
  if (!k) return { ...base, estimation: est0 };
  const cav = avs.reduce((s, x) => s + x, 0), car = ars.reduce((s, x) => s + x, 0);
  const zV = sv > 0 ? cav / (sv * Math.sqrt(k)) : null, zR = sr > 0 ? car / (sr * Math.sqrt(k)) : null;
  const vol = zV != null && zV >= p.z, price = zR != null && Math.abs(zR) >= p.z;
  return {
    ...base,
    sessions: k, from: days[0], to: days[k - 1], estimation: est0,
    sav0: sv > 0 ? round(avs[0] / sv, 2) : null,
    volumeMultiple0: round(Math.exp(avs[0]), 2), // giá trị GD phiên tin / mức kỳ vọng theo thị trường
    cav: round(cav, 4), zVolume: round(zV, 2),
    car: round(Math.expm1(car), 4), zReturn: round(zR, 2),
    classification: k < 1 ? "pending" : vol && price ? "repricing" : vol ? "absorption" : price ? "price_only" : "ignored",
  };
}

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
