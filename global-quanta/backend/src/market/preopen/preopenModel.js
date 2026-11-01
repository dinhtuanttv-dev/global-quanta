// Trung tâm thị trường: mô hình 3 kịch bản (PO-r1). Hàm thuần, chỉ dùng dữ liệu có trước thời điểm dự báo. Xem PO-prereg.md.
export const RULE = "PO-r1";
export const ES_T = 0.8;
export const TRAIN_DAYS = 250;
export const MIN_BUCKET = 8;
export const CLASS_T = 0.5;
export const BUCKETS = ["neg", "mid", "pos"];
export const bucketOf = (es) => (es <= -ES_T ? "neg" : es >= ES_T ? "pos" : "mid");
export const classOf = (cc) => (cc < -CLASS_T ? "neg" : cc > CLASS_T ? "pos" : "mid");

const mean = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
export function quantile(xs, q) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), p = (a.length - 1) * q, l = Math.floor(p);
  return a[l] + (a[Math.min(l + 1, a.length - 1)] - a[l]) * (p - l);
}
const dateKey = (d) => String(d).slice(0, 10);

/** Giá gần nhất đã chốt tại thời điểm ts (giây): nến 60 phút chỉ dùng được sau khi kết thúc. */
export function priceAt(hourBars, ts) {
  let lo = 0, hi = hourBars.length - 1, out = null;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (hourBars[m].t + 3600 <= ts) { out = hourBars[m].close; lo = m + 1; } else hi = m - 1;
  }
  return out;
}
const utc = (date, h, m = 0) => Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`) / 1000;
/** % đổi của hợp đồng tương lai từ lúc VN đóng cửa phiên trước (15:00, tức 08:00 UTC) đến 08:30 hôm nay (01:30 UTC). */
export function esSinceClose(hourBars, prevDate, date) {
  const a = priceAt(hourBars, utc(prevDate, 8)), b = priceAt(hourBars, utc(date, 1, 30));
  return a > 0 && b > 0 ? (b / a - 1) * 100 : null;
}

/** Ghép mỗi phiên VN với ES đã biết trước 08:30 của phiên đó. */
export function alignRows(vnBars, esBars) {
  const out = [];
  for (let i = 1; i < vnBars.length; i++) {
    const b = vnBars[i], p = vnBars[i - 1], date = dateKey(b.date);
    if (!(p.close > 0) || !(b.open > 0) || !(b.close > 0)) continue;
    const es = esSinceClose(esBars, dateKey(p.date), date);
    if (es == null) continue;
    out.push({ date, es, gap: (b.open / p.close - 1) * 100, oc: (b.close / b.open - 1) * 100, cc: (b.close / p.close - 1) * 100 });
  }
  return out;
}

export function fitOpen(rows) {
  const mx = mean(rows.map((r) => r.es)), my = mean(rows.map((r) => r.gap));
  let n = 0, d = 0;
  for (const r of rows) { n += (r.es - mx) * (r.gap - my); d += (r.es - mx) ** 2; }
  const b = d > 0 ? n / d : 0, a = my - b * mx;
  const res = rows.map((r) => r.gap - (a + b * r.es));
  return { a, b, qLo: quantile(res, 0.1), qHi: quantile(res, 0.9), predict(es) { const mid = a + b * es; return { lo: mid + this.qLo, mid, hi: mid + this.qHi }; } };
}
export const baselineOpen = (rows) => { const g = rows.map((r) => r.gap); return { lo: quantile(g, 0.1), mid: quantile(g, 0.5), hi: quantile(g, 0.9) }; };

/** Độ lệch chuẩn lợi suất cả phiên của `n` phiên cuối. */
const sdOf = (rows, n) => { const x = rows.slice(-n).map((r) => r.cc), m = mean(x); return x.length > 1 ? Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)) : null; };

/** Thống kê từng nhóm ES trên dữ liệu huấn luyện. Dải cả phiên co giãn theo biến động 20 phiên so với cả mẫu. */
export function fitBuckets(rows) {
  const scale = (() => { const a = sdOf(rows, 20), b = sdOf(rows, rows.length); return a > 0 && b > 0 ? Math.min(2, Math.max(0.5, a / b)) : 1; })();
  const all = rows.map((r) => r.cc);
  const out = {};
  for (const k of BUCKETS) {
    const s = rows.filter((r) => bucketOf(r.es) === k), enough = s.length >= MIN_BUCKET, cc = (enough ? s : rows).map((r) => r.cc);
    const counts = { neg: 1, mid: 1, pos: 1 };
    for (const r of s) counts[classOf(r.cc)]++;
    const total = counts.neg + counts.mid + counts.pos;
    out[k] = {
      n: s.length, esMedian: s.length ? quantile(s.map((r) => r.es), 0.5) : k === "neg" ? -ES_T : k === "pos" ? ES_T : 0,
      dayLo: quantile(cc, 0.1) * scale, dayMid: quantile(cc, 0.5), dayHi: quantile(cc, 0.9) * scale,
      gapMean: mean(s.map((r) => r.gap)), ocMean: mean(s.map((r) => r.oc)), ccMean: mean(s.map((r) => r.cc)),
      probs: { neg: counts.neg / total, mid: counts.mid / total, pos: counts.pos / total },
    };
  }
  const base = { neg: all.filter((v) => classOf(v) === "neg").length / all.length, mid: all.filter((v) => classOf(v) === "mid").length / all.length, pos: all.filter((v) => classOf(v) === "pos").length / all.length };
  return { buckets: out, base, scale, unconditional: { dayLo: quantile(all, 0.1), dayMid: quantile(all, 0.5), dayHi: quantile(all, 0.9) } };
}

export const brier = (p, cls) => BUCKETS.reduce((a, k) => a + (p[k] - (k === cls ? 1 : 0)) ** 2, 0);
export const pin = (y, q, t) => Math.max(t * (y - q), (t - 1) * (y - q));
export const pinball = (y, band) => pin(y, band.lo, 0.1) + pin(y, band.mid, 0.5) + pin(y, band.hi, 0.9);

const NAMES = { neg: "Tiêu cực", mid: "Trung tính", pos: "Tích cực" };
const POSTURE = { neg: "Thận trọng, chờ xác nhận", mid: "Chọn lọc, giữ kế hoạch", pos: "Ưu tiên giải ngân theo kế hoạch" };
const vi = (v) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const TRIGGER = { neg: `ES từ lúc VN đóng cửa ≤ −${vi(ES_T)}%`, mid: `ES từ lúc VN đóng cửa trong ±${vi(ES_T)}%`, pos: `ES từ lúc VN đóng cửa ≥ +${vi(ES_T)}%` };
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Dựng 3 kịch bản từ giá đóng cửa phiên trước. evidence quyết định có hiện xác suất và lời khuyên hành động hay không. */
export function buildScenarios({ rows, es, prevClose, evidence }) {
  const train = rows.slice(-TRAIN_DAYS), open = fitOpen(train), fit = fitBuckets(train);
  const lead = es == null ? "mid" : bucketOf(es);
  const px = (pct) => round(prevClose * (1 + pct / 100));
  const scenarios = BUCKETS.map((id) => {
    const b = fit.buckets[id], anchor = id === lead && es != null ? es : b.esMedian, o = open.predict(anchor);
    const openBand = evidence.openBand ? { lo: px(o.lo), mid: px(o.mid), hi: px(o.hi) } : null;
    const dayBand = { lo: px(b.dayLo), hi: px(b.dayHi) };
    return {
      id, name: NAMES[id], trigger: TRIGGER[id], esAnchor: round(anchor, 2), open: openBand, day: dayBand, n: b.n, posture: POSTURE[id],
      probability: evidence.probabilities ? round(b.probs[id] * 100, 0) : null,
      confirm: id === "neg" ? `Dưới ${vi(prevClose)} sau 10:00` : id === "pos" ? `Trên ${vi(prevClose)} sau 10:00` : `Trong ${vi(dayBand.lo)}–${vi(dayBand.hi)} đến 10:00`,
      invalid: id === "neg" ? `Lấy lại ${vi(prevClose)}` : id === "pos" ? `Về dưới ${vi(prevClose)}` : `Ra ngoài ${vi(dayBand.lo)}–${vi(dayBand.hi)}`,
      action: id === "neg" ? (evidence.noPanicSell ? "Lịch sử: giảm từ đầu phiên rồi hồi, không bán đuổi lúc mở." : "Chờ phản ứng sau 10:00. Quy tắc hành động chưa có bằng chứng.")
        : id === "pos" ? (evidence.noChase ? "Lịch sử: mở cao rồi hụt lại, không mua đuổi lúc mở." : "Chờ giữ được vùng mở cửa. Quy tắc hành động chưa có bằng chứng.")
        : "Giữ tỷ trọng theo kế hoạch.",
    };
  });
  return { lead, scenarios, open: { b: round(open.b, 3), a: round(open.a, 3) }, scale: round(fit.scale, 2), trainDays: train.length, trainFrom: train[0]?.date ?? null, trainTo: train.at(-1)?.date ?? null };
}

/** Giá đang đi theo kịch bản nào: mở cửa rơi vào nhóm nào, kịch bản dẫn đầu còn hiệu lực không. */
export function trackSession({ scenarios, lead, open, last, prevClose }) {
  if (!(open > 0) || !(last > 0)) return null;
  const gap = (open / prevClose - 1) * 100, move = (last / prevClose - 1) * 100;
  const leadSc = scenarios.find((s) => s.id === lead);
  const inOpen = leadSc?.open ? open >= leadSc.open.lo && open <= leadSc.open.hi : null;
  const inDay = leadSc ? last >= leadSc.day.lo && last <= leadSc.day.hi : null;
  const invalidated = lead === "neg" ? last > prevClose : lead === "pos" ? last < prevClose : inDay === false;
  return { open: round(open), last: round(last), gapPct: round(gap, 2), movePct: round(move, 2), inOpen, inDay, invalidated, current: classOf(move) };
}
