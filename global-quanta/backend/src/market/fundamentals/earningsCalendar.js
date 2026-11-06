// LC4 (06/11/2026) — LỊCH CÔNG BỐ KQKD tự tính trên Gateway (thay Project A /api/cotuc/earnings-signals). Hàm thuần, không I/O.
// Nguồn: kho BCTC K0 (ngày dữ liệu vào VNDirect, đúng là ngày công bố từ năm tài chính 2020) + tin công bố thông tin chính thức VNDirect
//        newsType "financialstatement" (BCTC, thông cáo KQKD, giải trình biến động lợi nhuận; có từ 2024, sớm hơn ngày dữ liệu vài ngày).
//
// 1. Ngày công bố thật của (mã, quý) = sớm nhất của { tin BCTC chính thức trong (kết thúc quý; +120 ngày], ngày dữ liệu nếu trễ 0–120 ngày }.
// 2. Độ trễ L (ngày sau kết thúc quý) theo LOẠI QUÝ (Q1, bán niên Q2, Q3, Q4) của chính mã, ≤ 6 năm gần nhất. Bayes thực nghiệm:
//    mã ít lịch sử được co về phân phối nhóm (cùng mẫu BCTC, cùng loại quý): trung vị ước = (n·trung vị mã + κ·trung vị nhóm)/(n + κ), κ = 2;
//    dải P10–P90 dùng điểm mã khi n ≥ 4, ngược lại dùng phân phối nhóm dời theo chênh trung vị.
// 3. Xác suất công bố trong h phiên tới, có điều kiện CHƯA công bố tới hôm nay (hàm rủi ro thực nghiệm, Kaplan–Meier không kiểm duyệt):
//    P(L ≤ t + h | L > t) với mẫu = độ trễ của mã (trọng số 1) ∪ nhóm (trọng số κ/|nhóm|), làm mịn Laplace; quá hạn pháp lý -> tách riêng.
// 4. Tiến độ mùa: % mã đã công bố theo ngày sau kết thúc quý, so cùng quý các năm trước (cùng tập mã).
// Nhãn MÔ TẢ: ngày dự kiến là ước tính thống kê, không phải lịch công ty đăng ký.
export const LC_VERSION = "LC-v1 (2026-11-06)";
export const LC = Object.freeze({ kappa: 2, years: 6, minOwn: 4, lagMax: 120, deadline: 45, deadlineStandalone: 20, horizonDays: 5, seasonDays: 75 });
const DAY = 864e5;
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const quantile = (a, p) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const qOf = (fiscal) => Math.ceil(Number(fiscal.slice(5, 7)) / 3);
export const quarterEnd = (y, q) => { const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
const labelOf = (fiscal) => `Q${qOf(fiscal)}/${fiscal.slice(0, 4)}`;
const isEnd = (f) => /^\d{4}-(03|06|09|12)-\d{2}$/.test(String(f ?? ""));
export const FS_TITLE = /báo cáo tài chính|bctc|kết quả kinh doanh|kết quả sản xuất kinh doanh|giải trình|thông cáo báo chí/i;

/**
 * Kỳ báo cáo ghi trong tiêu đề tin (null nếu không ghi): "quý 3/2026", "quý III năm 2026", "6 tháng / bán niên / soát xét 2026" (Q2),
 * "9 tháng 2026" (Q3), "năm 2025 / kiểm toán 2025" (Q4). Dùng để không gán nhầm "Đính chính BCTC quý 2" vào mùa Q3.
 */
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
export function periodOfTitle(title) {
  const t = String(title ?? "").toLowerCase().normalize("NFC");
  let m = t.match(/quý\s*(i{1,3}|iv|[1-4])\s*(?:[\/\-–.]|năm)?\s*(20\d\d)/);
  if (m) return quarterEnd(Number(m[2]), ROMAN[m[1]] ?? Number(m[1]));
  m = t.match(/(?:6 tháng|sáu tháng|bán niên|soát xét)[^0-9]{0,30}(20\d\d)/);
  if (m) return quarterEnd(Number(m[1]), 2);
  m = t.match(/(?:9 tháng|chín tháng)[^0-9]{0,30}(20\d\d)/);
  if (m) return quarterEnd(Number(m[1]), 3);
  m = t.match(/(?:năm|kiểm toán)\s*(?:tài chính\s*)?(20\d\d)/);
  if (m) return quarterEnd(Number(m[1]), 4);
  return null;
}
/** Tin có thể thuộc kỳ fiscal: tiêu đề ghi đúng kỳ, hoặc không ghi kỳ và rơi vào cửa sổ (kết thúc quý; +120 ngày]. */
const belongs = (fiscal, date, title) => {
  const p = periodOfTitle(title);
  if (p) return p === fiscal;
  const e = ms(fiscal), d = ms(String(date).slice(0, 10));
  return d > e && d - e <= LC.lagMax * DAY;
};

/** Ngày công bố thật theo quý. disclosures: [[date, title]] (tin financialstatement). Trả Map fiscal -> { date, source }. */
export function publishDates(rec, disclosures = []) {
  const ds = disclosures.filter(([d, t]) => d && FS_TITLE.test(t ?? "")).map(([d, t]) => [String(d).slice(0, 10), t]).sort((a, b) => a[0].localeCompare(b[0]));
  const out = new Map();
  for (const q of rec?.quarters ?? []) {
    if (!isEnd(q.fiscal)) continue;
    const end = ms(q.fiscal);
    const c = q.created && ms(q.created) >= end && ms(q.created) - end <= LC.lagMax * DAY ? q.created : null;
    const d = ds.find(([x, t]) => ms(x) > end && belongs(q.fiscal, x, t))?.[0] ?? null;
    const date = c && d ? (d < c ? d : c) : c ?? d;
    if (date) out.set(q.fiscal, { date, source: d && date === d ? "DISCLOSURE" : "DATA" });
  }
  return out;
}
/** Tin BCTC chính thức của quý `fiscal` (chưa chắc đã có số trong kho). */
export function disclosureFor(fiscal, disclosures = []) {
  const end = ms(fiscal);
  return disclosures.filter(([d, t]) => d && FS_TITLE.test(t ?? "") && ms(String(d).slice(0, 10)) > end && belongs(fiscal, d, t))
    .map(([d, t]) => ({ date: String(d).slice(0, 10), title: t })).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** Độ trễ lịch sử (ngày) theo loại quý, ≤ LC.years năm trước `beforeFiscal`. */
export function lagHistory(pub, qType, beforeFiscal) {
  const lags = [];
  for (const [fiscal, p] of pub) {
    if (qOf(fiscal) !== qType || fiscal >= beforeFiscal || Number(fiscal.slice(0, 4)) < Number(beforeFiscal.slice(0, 4)) - LC.years) continue;
    lags.push({ fiscal, lag: Math.round((ms(p.date) - ms(fiscal)) / DAY) });
  }
  return lags.sort((a, b) => a.fiscal.localeCompare(b.fiscal));
}

/** Mô hình độ trễ co về nhóm. own: số ngày của mã; peer: số ngày của nhóm. */
export function lagModel(own, peer) {
  const n = own.length, pm = quantile(peer, 0.5);
  if (!n && !fin(pm)) return null;
  const om = quantile(own, 0.5);
  const med = n ? (n * om + LC.kappa * (pm ?? om)) / (n + LC.kappa) : pm;
  let lo, hi;
  if (n >= LC.minOwn) { lo = quantile(own, 0.1); hi = quantile(own, 0.9); }
  else { const shift = med - (pm ?? med); lo = (quantile(peer, 0.1) ?? med) + shift; hi = (quantile(peer, 0.9) ?? med) + shift; }
  return { median: med, lo: Math.min(lo, med), hi: Math.max(hi, med), n, lateShare: n ? own.filter((x) => x > LC.deadline).length / n : null };
}

/** P(L ≤ t + h | L > t): mẫu có trọng số (mã 1, nhóm κ/|nhóm|), làm mịn Laplace. */
export function hazard(own, peer, t, h) {
  const w = peer.length ? LC.kappa / peer.length : 0;
  let surv = 0.5, hit = 0.25; // làm mịn: nửa quan sát "còn sống", 1/4 rơi vào cửa sổ
  for (const x of own) { if (x > t) { surv += 1; if (x <= t + h) hit += 1; } }
  for (const x of peer) { if (x > t) { surv += w; if (x <= t + h) hit += w; } }
  return Math.max(0, Math.min(1, hit / surv));
}

/** Ngày giao dịch đầu tiên ≥ date. */
export function nextTradingDay(date, isHoliday = () => false) {
  let t = ms(date);
  for (let k = 0; k < 15 && isHoliday(iso(t)); k++) t += DAY;
  return iso(t);
}
/** Số ngày lịch tương ứng h phiên giao dịch tính từ `today`. */
function calendarDaysFor(today, h, isHoliday) {
  let t = ms(today), n = 0, d = 0;
  while (n < h && d < 40) { t += DAY; d += 1; if (!isHoliday(iso(t))) n += 1; }
  return d;
}

/** Quý vừa kết thúc gần nhất (mùa báo cáo hiện tại) và quý đang chạy (mùa kế tiếp). */
export function seasonQuarters(today) {
  const y = Number(today.slice(0, 4)), q = Math.floor((Number(today.slice(5, 7)) - 1) / 3); // q quý đã kết thúc trong năm (0 = chưa)
  const current = q === 0 ? quarterEnd(y - 1, 4) : quarterEnd(y, q);
  return { current, next: quarterEnd(y, q + 1) };
}

/**
 * Lịch cho quý `fiscal`. recs: [{ ticker, tpl, quarters }]; disclosuresOf(t) -> [[date,title]]; resultOf(t) -> dòng KQKD (tuỳ chọn).
 * Trả { quarter, rows, curve, prevCurves, stats }.
 */
export function buildCalendar(recs, { fiscal, today, disclosuresOf = () => [], resultOf = () => null, isHoliday = () => false }) {
  const qType = qOf(fiscal), end = ms(fiscal);
  const ctx = recs.map((rec) => {
    const disc = disclosuresOf(rec.ticker) ?? [];
    const pub = publishDates(rec, disc);
    return { rec, disc, pub, hist: lagHistory(pub, qType, fiscal) };
  });
  // Phân phối nhóm (mẫu BCTC × loại quý).
  const peerOf = new Map();
  for (const c of ctx) for (const h of c.hist) { const k = c.rec.tpl ?? "corp"; (peerOf.get(k) ?? peerOf.set(k, []).get(k)).push(h.lag); }
  const all = [...peerOf.values()].flat();
  const tDays = Math.round((ms(today) - end) / DAY);
  const hDays = calendarDaysFor(today, LC.horizonDays, isHoliday);
  const rows = ctx.map(({ rec, disc, pub, hist }) => {
    const own = hist.map((h) => h.lag), peer = peerOf.get(rec.tpl ?? "corp")?.length >= 20 ? peerOf.get(rec.tpl ?? "corp") : all;
    const model = lagModel(own, peer);
    const done = pub.get(fiscal);
    const dsc = done ? null : disclosureFor(fiscal, disc);
    const expected = model ? nextTradingDay(iso(end + Math.round(model.median) * DAY), isHoliday) : null;
    const band = model ? [nextTradingDay(iso(end + Math.round(model.lo) * DAY), isHoliday), nextTradingDay(iso(end + Math.round(model.hi) * DAY), isHoliday)] : null;
    let status, date = null;
    if (done) { status = "REPORTED"; date = done.date; }
    else if (dsc && dsc.date <= today) { status = "DISCLOSED"; date = dsc.date; }
    else if (tDays > LC.deadline) status = "OVERDUE";
    else status = "UPCOMING";
    const pNext = status === "UPCOMING" && tDays >= 0 ? r4(hazard(own, peer, tDays, hDays)) : null;
    const res = status === "REPORTED" ? resultOf(rec.ticker) : null;
    return {
      t: rec.ticker, tpl: rec.tpl ?? "corp", status, date, source: done?.source ?? (dsc ? "DISCLOSURE" : null), disclosureTitle: dsc?.title ?? null,
      lagDays: date ? Math.round((ms(date) - end) / DAY) : null,
      expected, band, medianLag: model ? Math.round(model.median) : null, ownN: model?.n ?? 0, lateShare: r4(model?.lateShare ?? null), pNext,
      history: hist.slice(-8).map((h) => ({ q: labelOf(h.fiscal), lag: h.lag })),
      result: res && res.fiscal === fiscal ? { npatYoY: res.npatYoY ?? null, ytd: res.ytd?.growth ?? null, sueCore: res.sueCore ?? null, sueNpat: res.sueNpat ?? null, flags: res.flags ?? [] } : null,
    };
  }).sort((a, b) => (a.date ?? a.expected ?? "9").localeCompare(b.date ?? b.expected ?? "9") || a.t.localeCompare(b.t));

  // Đường tiến độ: % đã công bố theo ngày sau kết thúc quý, quý này và cùng quý 1–2 năm trước.
  const curveOf = (f) => {
    const e = ms(f); const lags = ctx.map((c) => c.pub.get(f)).filter(Boolean).map((p) => Math.round((ms(p.date) - e) / DAY));
    const n = ctx.length; const out = [];
    for (let d = 0; d <= LC.seasonDays; d++) out.push(r4(lags.filter((x) => x <= d).length / n));
    return { fiscal: f, label: labelOf(f), reported: lags.length, curve: out };
  };
  const y = Number(fiscal.slice(0, 4));
  const curve = curveOf(fiscal);
  const prevCurves = [quarterEnd(y - 1, qType), quarterEnd(y - 2, qType)].map(curveOf);
  const atToday = Math.max(0, Math.min(LC.seasonDays, tDays));
  // Sớm hay muộn so mọi năm: tỷ lệ đã công bố tới cùng ngày, so trung bình 2 năm trước.
  const prevAt = prevCurves.map((c) => c.curve[atToday]).filter(fin);
  // Tin tốt công bố sớm? (Kross 1981; Chambers & Penman 1984) — mô tả: LNST YoY trung vị của 1/3 công bố sớm nhất vs 1/3 muộn nhất.
  const rep = rows.filter((r) => r.status === "REPORTED" && r.result?.npatYoY?.status === "NORMAL" && fin(r.lagDays)).sort((a, b) => a.lagDays - b.lagDays);
  const third = Math.floor(rep.length / 3);
  const med = (a) => r4(quantile(a.map((r) => r.result.npatYoY.value), 0.5));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    version: LC_VERSION, label: "MÔ TẢ", asOf: today, quarter: { fiscal, label: labelOf(fiscal), end: fiscal, deadlineStandalone: iso(end + LC.deadlineStandalone * DAY), deadlineConsolidated: iso(end + LC.deadline * DAY), dayOfSeason: tDays },
    rows, curve, prevCurves,
    stats: {
      tickers: rows.length, reported: count("REPORTED"), disclosed: count("DISCLOSED"), upcoming: count("UPCOMING"), overdue: count("OVERDUE"),
      expectedNext: r4(rows.reduce((s, r) => s + (r.pNext ?? 0), 0)), horizonDays: LC.horizonDays,
      shareNow: curve.curve[atToday] ?? null, sharePrevSameDay: prevAt.length ? r4(prevAt.reduce((a, b) => a + b, 0) / prevAt.length) : null,
      earlyVsLate: third >= 10 ? { early: med(rep.slice(0, third)), late: med(rep.slice(-third)), n: third } : null,
    },
    method: "Ngày dự kiến = kết thúc quý + trung vị độ trễ cùng loại quý của mã (≤ 6 năm), co về nhóm cùng mẫu BCTC khi ít lịch sử (κ = 2); dải P10–P90; khả năng công bố trong 5 phiên tới có điều kiện chưa công bố tới hôm nay. Ngày công bố thật = sớm nhất của tin BCTC chính thức (VNDirect) và ngày dữ liệu. MÔ TẢ — không phải lịch công ty đăng ký.",
  };
}
