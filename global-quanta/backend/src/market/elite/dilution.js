// PX0 (18/11/2026) — Vòng đời đợt PHA LOÃNG ≥ 10% (cổ tức cổ phiếu, cổ phiếu thưởng, quyền mua): SẮP GDKHQ → HẬU GDKHQ → cổ phiếu mới
// giao dịch được (niêm yết bổ sung). CHỈ HIỂN THỊ: PX-r1 (2020–2026, 520 sự kiện) KHÔNG ĐẠT — mua sau GDKHQ pha loãng không kém có ý nghĩa
// (−0,57% / 30 phiên, t −0,65; nửa 2023–2026 dương) -> không có cổng. Hàm thuần, chỉ dùng sự kiện đã công bố tới phiên tính.
//
// Ngày niêm yết bổ sung: sự kiện ADD_LISTING (CE-v1) cùng mã trong (GDKHQ, GDKHQ + 120 ngày], chọn đợt SỐ LƯỢNG LỚN NHẤT (loại ESOP lẻ).
// Chưa công bố -> ước tính = GDKHQ + trung vị độ trễ lịch sử của CHÍNH MÃ (≥ 2 đợt), nếu không có thì trung vị toàn thị trường.

export const PX_VERSION = "PX-v0 (18/11/2026)";
export const PX_RULES = Object.freeze({ dilMin: 10, preSessions: 10, postAfterListing: 5, maxPost: 60, linkDays: 120, defaultLag: 25, minOwnLags: 2 });
/** PX-r1 (đăng ký ef198a2, chạy 94b3f06) — bằng chứng hiển thị kèm huy hiệu. */
export const PX_R1 = Object.freeze({
  verdict: "KHÔNG ĐẠT", ranAt: "2026-11-18", period: "01/2020–11/2026", n: 520, mean30: -0.0057, t: -0.65, median30: -0.0134, half1: -0.0154, half2: 0.0042, superShare: 0.0519,
  textVi: "PX-r1 (520 đợt pha loãng ≥ 10%, 2020–2026): mua ở phiên sau GDKHQ, giữ 30 phiên, kém trung bình thị trường 0,57% (t −0,65, không có ý nghĩa; 2023–2026 còn dương). Không có cổng — chỉ để biết lịch nguồn cung.",
});
const DIL_CATS = new Set(["STOCK", "BONUS", "RIGHTS"]);
const fin = Number.isFinite;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/** Bộ đếm phiên theo hàm isTradingDay(iso). */
export function sessionClock(isTrading) {
  const cache = new Map(), ok = (d) => { if (!cache.has(d)) cache.set(d, Boolean(isTrading(d))); return cache.get(d); };
  /** Số phiên trong (a, b] (b > a), âm nếu b < a. */
  const between = (a, b) => { if (a === b) return 0; const [lo, hi, sg] = a < b ? [a, b, 1] : [b, a, -1]; let n = 0; for (let d = addDays(lo, 1); d <= hi; d = addDays(d, 1)) if (ok(d)) n++; return n * sg; };
  /** Phiên thứ n sau d (n ≥ 1), hoặc d nếu n = 0. */
  const shift = (d, n) => { let x = d, k = 0; while (k < n) { x = addDays(x, 1); if (ok(x)) k++; } return x; };
  return { between, shift, isTrading: ok };
}

/** "Số lượng 554,514,846 CP" -> 554514846. */
export const qtyOf = (title) => { const m = String(title ?? "").match(/([\d.,]{4,})/); return m ? Number(m[1].replace(/[.,]/g, "")) : null; };
const known = (e, asOf) => !e.disclosed || e.disclosed <= asOf;

/** Đợt pha loãng ≥ dilMin% đã công bố tới asOf, tăng dần theo GDKHQ. */
export function dilutiveEvents(events, asOf, rules = PX_RULES) {
  return (events ?? []).filter((e) => DIL_CATS.has(e.cat) && e.ex && fin(e.ratio) && e.ratio >= rules.dilMin && known(e, asOf)).sort((a, b) => a.ex.localeCompare(b.ex));
}
/** Ngày niêm yết bổ sung của một đợt: ADD_LISTING lớn nhất trong (ex, ex + linkDays], đã công bố tới asOf. */
export function linkListing(ev, events, asOf, rules = PX_RULES) {
  const cand = (events ?? []).filter((e) => e.cat === "ADD_LISTING" && e.t === ev.t && e.date && e.date > ev.ex && e.date <= addDays(ev.ex, rules.linkDays) && known(e, asOf));
  if (!cand.length) return null;
  return cand.reduce((a, b) => ((qtyOf(b.title) ?? 0) > (qtyOf(a.title) ?? 0) ? b : a));
}
/** Độ trễ GDKHQ -> niêm yết bổ sung (phiên) của các đợt ĐÃ niêm yết tới asOf. */
export function listingLags(events, asOf, clock, rules = PX_RULES) {
  const out = [];
  for (const ev of dilutiveEvents(events, asOf, rules)) {
    const l = linkListing(ev, events, asOf, rules);
    if (l && l.date <= asOf) out.push({ t: ev.t, ex: ev.ex, listing: l.date, lag: clock.between(ev.ex, l.date) });
  }
  return out;
}

/**
 * Pha vòng đời của MỘT mã tại asOf.
 * @returns {{ phase: "NONE" } | { phase: "PRE_EX"|"POST_EX", ex, cat, ratio, record, sessionsTo?, day?, listing, listingBasis: "ANNOUNCED"|"ESTIMATED_OWN"|"ESTIMATED_MARKET", until, ownLag, nOwn }}
 */
export function dilutionPhase({ asOf, events, clock, marketLag = null, rules = PX_RULES }) {
  const dil = dilutiveEvents(events, asOf, rules);
  if (!dil.length) return { phase: "NONE" };
  const lags = listingLags(events, asOf, clock, rules).map((x) => x.lag).filter((x) => x > 0 && x <= rules.maxPost);
  const ownLag = lags.length >= rules.minOwnLags ? Math.round(median(lags)) : null;
  for (const ev of dil) {
    if (ev.ex < addDays(asOf, -130)) continue; // đã qua quá xa (> ~90 phiên) — không thể còn trong cửa sổ
    const sTo = clock.between(asOf, ev.ex);
    if (sTo > rules.preSessions) continue; // còn xa
    const l = linkListing(ev, events, asOf, rules);
    const lag = l ? clock.between(ev.ex, l.date) : ownLag ?? marketLag ?? rules.defaultLag;
    const listing = l?.date ?? clock.shift(ev.ex, lag);
    const until = clock.shift(listing, rules.postAfterListing), endCap = clock.shift(ev.ex, rules.maxPost);
    const end = until < endCap ? until : endCap;
    const base = { ex: ev.ex, cat: ev.cat, ratio: ev.ratio, record: ev.record ?? null, disclosed: ev.disclosed ?? null, listing, listingBasis: l ? "ANNOUNCED" : ownLag != null ? "ESTIMATED_OWN" : "ESTIMATED_MARKET", lag, until: end, ownLag, nOwn: lags.length };
    if (sTo > 0) return { phase: "PRE_EX", sessionsTo: sTo, ...base };
    if (asOf <= end) return { phase: "POST_EX", day: -sTo, listed: listing <= asOf, ...base };
  }
  return { phase: "NONE" };
}

/** Trung vị độ trễ niêm yết toàn thị trường (mọi mã trong tài liệu CE-v1). */
export function marketListingLag(allEvents, asOf, clock, rules = PX_RULES) {
  const byT = new Map(); for (const e of allEvents ?? []) { if (!byT.has(e.t)) byT.set(e.t, []); byT.get(e.t).push(e); }
  const lags = []; for (const ev of byT.values()) for (const x of listingLags(ev, asOf, clock, rules)) if (x.lag > 0 && x.lag <= rules.maxPost) lags.push(x.lag);
  return { lag: lags.length ? Math.round(median(lags)) : null, n: lags.length, p25: lags.length ? Math.round([...lags].sort((a, b) => a - b)[Math.floor(lags.length * 0.25)]) : null, p75: lags.length ? Math.round([...lags].sort((a, b) => a - b)[Math.floor(lags.length * 0.75)]) : null };
}

/**
 * Lịch sử các đợt pha loãng của một mã với kết quả (giá điều chỉnh, vượt VN-Index): phiên GDKHQ, mua ex+1 giữ 10/20/30 phiên.
 * @param px  [[ngày, giá điều chỉnh, ...]] tăng dần · @param mkt Map(ngày -> VN-Index)
 */
export function dilutionHistory(events, asOf, px, mkt, clock, rules = PX_RULES) {
  const idx = new Map((px ?? []).map((r, i) => [r[0], i]));
  const out = [];
  for (const ev of dilutiveEvents(events, asOf, rules)) {
    if (ev.ex > asOf) continue;
    const i = idx.get(ev.ex); const l = linkListing(ev, events, asOf, rules);
    const row = { ex: ev.ex, cat: ev.cat, ratio: ev.ratio, listing: l?.date ?? null, lag: l && l.date <= asOf ? clock.between(ev.ex, l.date) : null, exDay: null, x10: null, x20: null, x30: null };
    if (i != null && i > 0) {
      const ex = (a, b) => { const pa = px[a], pb = px[b]; if (!pa || !pb) return null; const ma = mkt.get(pa[0]), mb = mkt.get(pb[0]); return pa[1] > 0 && pb[1] > 0 && ma > 0 && mb > 0 ? Math.log(pb[1] / pa[1]) - Math.log(mb / ma) : null; };
      row.exDay = ex(i - 1, i);
      for (const h of [10, 20, 30]) if (i + 1 + h < px.length) row[`x${h}`] = ex(i + 1, i + 1 + h);
    }
    out.push(row);
  }
  return out.reverse();
}
