// EPS-v1 (07/11/2026, P0 kiểm toán BCTC) — EPS 12 tháng & số cổ phiếu lưu hành ĐÚNG cho mọi mẫu BCTC (doanh nghiệp / ngân hàng / chứng khoán /
// bảo hiểm). Lỗi cũ: EPS 12 tháng = tổng 4 "EPS quý" (mã 23001) — mẫu ngân hàng / chứng khoán của VNDirect KHÔNG có chỉ tiêu này -> 36/284
// mã EPS = 0 (TCB, MBB, CTG, SSI…), ACB 542 đ (thật ~2.773 đ); EPS quý trước đợt chia thưởng còn tính trên số cổ phiếu cũ.
// Nguồn (VNDirect finfo /v4/ratios, có lịch sử theo quý):
//   EPS_TR             — "EPS 4 quý liền kề" do VNDirect công bố (quy ước thị trường, đã theo số cổ phiếu hiện hành).
//   OUTSTANDING_SHARES — số cổ phiếu lưu hành theo kỳ (thấy rõ các đợt thưởng / phát hành).
// Quy tắc chọn (selectEps, hàm thuần):
//   1. EPS_TR của ĐÚNG quý BCTC mới nhất của mã (không dùng quý khác — tránh lệch kỳ);
//   2. thiếu -> LNST công ty mẹ 12 tháng / số cổ phiếu lưu hành hiện hành (cùng gốc cổ phiếu cho cả 4 quý = điều chỉnh hồi tố pha loãng);
//   3. thiếu cả hai -> tổng EPS quý (chỉ mẫu doanh nghiệp, như cũ); không có -> null (KHÔNG BAO GIỜ trả 0 thay cho "không có").
//   Kèm `check` = EPS tự tính / EPS_TR − 1 (đối chiếu 2 nguồn; quỹ khen thưởng phúc lợi làm EPS chính thức thấp hơn vài %).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const EPS_VERSION = "EPS-v1 (2026-11-07)";
const BASE = "https://api-finfo.vndirect.com.vn/v4/ratios";
const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };

/** Giá trị có ngày ≤ `date` gần nhất ([[ngày, giá trị]] tăng dần); không có -> null. */
export function valueAsOf(rows, date) {
  if (!rows?.length) return null; let v = null;
  for (const [d, x] of rows) { if (d <= date) v = x; else break; }
  return v;
}
/** Giá trị đúng ngày `date` (cuối quý). */
export const valueAt = (rows, date) => rows?.find((r) => r[0] === date)?.[1] ?? null;
/** Giá trị mới nhất (số cổ phiếu hiện hành — VNDirect ghi kỳ hiện hành ở cuối năm tài chính). */
export const latestValue = (rows) => (rows?.length ? rows[rows.length - 1][1] : null);

// ── EPS-v2 (P1, 11/11/2026) — điều chỉnh hồi tố theo IAS 33 (VAS 30 tương đương) ─────────────────────────────────────────────
// Lỗi EPS-v1: EPS_TR của VNDirect tính trên số CP CUỐI QUÝ; đợt thưởng / cổ tức CP có GDKHQ SAU quý (TCB ×1,5 ngày 29/10) làm giá
// điều chỉnh mà EPS không -> P/E thấp sai (TCB 5,4x, đúng ~8,2x). Số CP "hiện hành" của VNDirect lại đã cộng cả đợt phát hành chưa
// xảy ra (SCL quyền mua GDKHQ 09/11) -> không dùng làm mẫu số.
// Quy tắc (IAS 33 §26–28, §64, A2):
//   • cổ tức cổ phiếu / thưởng / chia tách (không thu tiền): hệ số 1 + r, hồi tố mọi kỳ;
//   • quyền mua cho cổ đông hiện hữu dưới giá: chỉ phần THƯỞNG ẩn, hệ số = giá trước quyền / TERP, TERP = (P + r·S) / (1 + r);
//     cổ phiếu mua bằng tiền mới vào bình quân gia quyền từ ngày phát hành (chưa có trong 4 quý đã qua -> không cộng);
//   • ESOP / riêng lẻ / chuyển đổi: không hồi tố.
//   EPS = EPS gốc tại cuối quý ÷ ∏ hệ số các sự kiện có GDKHQ trong (cuối quý, hôm nay].
// Ghi chú quỹ khen thưởng phúc lợi (KTPL): VAS 30 / TT200 trừ phần trích quỹ KTPL khỏi LNST khi tính EPS cơ bản trên BCTC; EPS_TR
// của VNDirect (và EPS ở đây) KHÔNG trừ -> EPS trên BCTC có thể thấp hơn vài %.
export const EPS_V2 = "EPS-v2 IAS33 (2026-11-11)";
export const KTPL_NOTE = "EPS 4 quý chưa trừ quỹ khen thưởng phúc lợi (VAS 30 trừ khoản này) — EPS trên BCTC có thể thấp hơn vài %.";
const PRORATA = new Set(["STOCK", "BONUS"]);

/** Giá phát hành (đ/cp) của quyền mua cho cổ đông hiện hữu; không phải quyền mua theo tỷ lệ -> null. */
export function rightsPrice(e) {
  const s = String(e?.title ?? "");
  if (e?.cat !== "RIGHTS" || !/(CĐHH|cổ đông hiện hữu|co dong hien huu)/i.test(s)) return null;
  const m = s.match(/giá\s*([\d.,]+)\s*đ/i); if (!m) return null;
  const v = Number(m[1].replace(/[.,]/g, "")); return v > 0 ? v : null;
}

/**
 * Hệ số một sự kiện. `pcum` = giá đóng cửa CHƯA điều chỉnh phiên liền trước GDKHQ (đ). Trả null nếu không phải sự kiện hồi tố.
 * @returns {{ epsFactor: number, shareFactor: number, kind: string } | null}
 */
export function actionFactor(e, pcum = null) {
  const r = fin(e?.ratio) && e.ratio > 0 ? e.ratio / 100 : null; if (!r) return null;
  if (PRORATA.has(e.cat)) return { epsFactor: 1 + r, shareFactor: 1 + r, kind: e.cat };
  const s = rightsPrice(e); if (!s) return null;
  if (!fin(pcum) || pcum <= s) return { epsFactor: 1, shareFactor: 1 + r, kind: "RIGHTS_NO_BONUS" }; // không có phần thưởng ẩn
  const terp = (pcum + r * s) / (1 + r);
  return { epsFactor: pcum / terp, shareFactor: 1 + r, kind: "RIGHTS" };
}

/**
 * Các sự kiện hồi tố có GDKHQ trong (from, to]. `pcumOf(ex)` -> giá chưa điều chỉnh phiên trước GDKHQ (đ) hoặc null.
 * @returns {{ factor: number, shareFactor: number, actions: { ex: string, cat: string, ratio: number, factor: number, kind: string }[] }}
 */
export function postPeriodActions(events, from, to, pcumOf = () => null) {
  const seen = new Set(); let factor = 1, shareFactor = 1; const actions = [];
  for (const e of [...(events ?? [])].sort((a, b) => String(a.ex).localeCompare(String(b.ex)))) {
    if (!e?.ex || !(e.ex > from && e.ex <= to)) continue;
    const key = `${e.cat}|${e.ex}|${e.ratio}`; if (seen.has(key)) continue; seen.add(key); // nguồn trùng lặp
    const f = actionFactor(e, e.cat === "RIGHTS" ? pcumOf(e.ex) : null); if (!f) continue;
    factor *= f.epsFactor; shareFactor *= f.shareFactor;
    actions.push({ ex: e.ex, cat: e.cat, ratio: e.ratio, factor: r4(f.epsFactor), kind: f.kind });
  }
  return { factor, shareFactor, actions };
}

/** Số CP theo kỳ tại ngày t (không nhìn trước): số CP cuối quý gần nhất ≤ `fiscal` × các đợt thưởng / cổ tức CP có GDKHQ trong (fiscal, t]. */
export function sharesAt(sharesHist, fiscal, t, events = []) {
  const base = valueAsOf(sharesHist, fiscal); if (!fin(base)) return null;
  let f = 1; for (const e of events ?? []) if (PRORATA.has(e?.cat) && e.ex > fiscal && e.ex <= t && fin(e.ratio) && e.ratio > 0) f *= 1 + e.ratio / 100;
  return base * f;
}

/**
 * @param {{ npatTtm: number|null, quarterEnd: string|null, epsHist?: [string, number][], sharesHist?: [string, number][], sumEps?: number|null, tpl?: string,
 *           events?: object[], asOf?: string|null, pcumOf?: (ex: string) => number|null }} o
 * @returns {{ eps: number|null, source: "VND_EPS_TR"|"NPAT_SHARES"|"SUM_Q"|null, check: number|null, shares: number|null,
 *             basis: string|null, factor: number, actions: object[], sharesGap: number|null, flags: string[], epsQ: number|null }}
 */
export function selectEps({ npatTtm, quarterEnd, epsHist = [], sharesHist = [], sumEps = null, tpl = "corp", events = [], asOf = null, pcumOf = () => null }) {
  const latest = latestValue(sharesHist);
  const shQ = quarterEnd ? (valueAt(sharesHist, quarterEnd) ?? valueAsOf(sharesHist, quarterEnd)) : null;
  const pp = quarterEnd && asOf ? postPeriodActions(events, quarterEnd, asOf, pcumOf) : { factor: 1, shareFactor: 1, actions: [] };
  const F = pp.factor;
  const flags = [];
  const shBase = fin(shQ) && shQ > 0 ? shQ : fin(latest) && latest > 0 ? latest : null;
  const basis = fin(shQ) && shQ > 0 ? "Q_END_ADJ" : shBase ? "LATEST" : null; // LATEST: thiếu số CP cuối quý -> cách cũ, không áp hệ số
  const Fx = basis === "Q_END_ADJ" ? F : 1;
  const shares = shBase ? Math.round(shBase * Fx) : null; // số CP tương đương sau điều chỉnh hồi tố (mẫu số EPS)
  // Đối chiếu số CP VNDirect ghi hiện hành với số CP cuối quý × hệ số số lượng (gồm cả CP quyền mua) — lệch: ESOP / riêng lẻ / chưa phát hành / dữ liệu lỗi.
  const sharesGap = basis === "Q_END_ADJ" && fin(latest) ? r4(latest / (shQ * pp.shareFactor) - 1) : null;
  if (fin(sharesGap) && (sharesGap < -0.5 || sharesGap > 2)) flags.push("SHARES_ANOMALY");
  else if (fin(sharesGap) && Math.abs(sharesGap) > 0.02) flags.push("SHARES_GAP");
  const tr = quarterEnd ? valueAt(epsHist, quarterEnd) : null;
  const calc = fin(npatTtm) && shares > 0 ? npatTtm / shares : null;
  const base = { shares, basis, factor: r4(Fx), actions: Fx !== 1 ? pp.actions : [], sharesGap, flags };
  if (fin(tr) && tr !== 0) {
    const eps = tr / Fx;
    return { ...base, eps: Math.round(eps), epsQ: Math.round(tr), source: "VND_EPS_TR", check: fin(calc) ? r4(calc / eps - 1) : null };
  }
  if (fin(calc)) return { ...base, eps: Math.round(calc), epsQ: null, source: "NPAT_SHARES", check: null };
  if (tpl === "corp" && fin(sumEps) && sumEps !== 0) return { ...base, eps: Math.round(sumEps / Fx), epsQ: Math.round(sumEps), source: "SUM_Q", check: null };
  return { ...base, eps: null, epsQ: null, source: null, check: null };
}

/** Tải lịch sử EPS_TR + OUTSTANDING_SHARES, gộp `chunk` mã / lượt (tránh giới hạn tần suất). */
export async function fetchRatioHistory(tickers, { fetchImpl = globalThis.fetch, chunk = 20, since = "2015-01-01", log = console } = {}) {
  const out = {}, failed = [];
  for (let i = 0; i < tickers.length; i += chunk) {
    const codes = tickers.slice(i, i + chunk);
    let rows = null;
    for (let a = 0; a < 3 && !rows; a++) {
      try {
        const r = await fetchImpl(`${BASE}?q=code:${codes.join(",")}~ratioCode:EPS_TR,OUTSTANDING_SHARES~reportDate:gte:${since}&size=5000&sort=reportDate:asc`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        if (r.ok) rows = (await r.json()).data ?? []; else if (r.status !== 429) break;
      } catch { /* thử lại */ }
      if (!rows) await new Promise((z) => setTimeout(z, 1500 * (a + 1)));
    }
    if (!rows) { failed.push(...codes); log.warn?.(`[eps] lỗi tải ${codes[0]}…`); continue; }
    for (const x of rows) {
      const t = String(x.code).toUpperCase(); if (!fin(x.value) || !x.reportDate) continue;
      const k = x.ratioCode === "EPS_TR" ? "eps" : x.ratioCode === "OUTSTANDING_SHARES" ? "shares" : null; if (!k) continue;
      ((out[t] ??= { eps: [], shares: [] })[k]).push([String(x.reportDate).slice(0, 10), x.value]);
    }
  }
  for (const v of Object.values(out)) { v.eps.sort((a, b) => a[0].localeCompare(b[0])); v.shares = v.shares.filter((r) => r[1] > 0).sort((a, b) => a[0].localeCompare(b[0])); }
  return { byTicker: out, failed };
}

/** Kho EPS-v1 trên ổ Railway: <dir>/shares-eps.json.gz, làm mới trước mỗi lần dựng KQKD. */
export function createSharesEps({ dir, universe, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "shares-eps.json.gz");
  let memo = null, running = false;
  async function refresh() {
    if (running) return { running: true };
    running = true;
    try {
      const tickers = await universe(); if (!tickers.length) return { error: "chưa có danh mục mã" };
      const { byTicker, failed } = await fetchRatioHistory(tickers, { fetchImpl, log });
      const prev = doc()?.byTicker ?? {};
      const merged = { ...prev, ...byTicker }; // mã lỗi lượt này giữ bản cũ
      const d = { version: EPS_VERSION, fetchedAt: new Date(now()).toISOString(), byTicker: merged, failed };
      writeGz(file, d); memo = d;
      return { tickers: Object.keys(byTicker).length, failed: failed.length };
    } finally { running = false; }
  }
  function doc() { return memo ?? (memo = readGz(file)); }
  const of = (t) => doc()?.byTicker?.[t] ?? null;
  return { refresh, doc, of, hasData: () => fs.existsSync(file), status: () => ({ version: EPS_VERSION, running, fetchedAt: doc()?.fetchedAt ?? null, tickers: Object.keys(doc()?.byTicker ?? {}).length }) };
}
