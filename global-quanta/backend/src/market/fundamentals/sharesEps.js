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

/**
 * @param {{ npatTtm: number|null, quarterEnd: string|null, epsHist?: [string, number][], sharesHist?: [string, number][], sumEps?: number|null, tpl?: string }} o
 * @returns {{ eps: number|null, source: "VND_EPS_TR"|"NPAT_SHARES"|"SUM_Q"|null, check: number|null, shares: number|null }}
 */
export function selectEps({ npatTtm, quarterEnd, epsHist = [], sharesHist = [], sumEps = null, tpl = "corp" }) {
  const shares = latestValue(sharesHist);
  const tr = quarterEnd ? valueAt(epsHist, quarterEnd) : null;
  const calc = fin(npatTtm) && fin(shares) && shares > 0 ? npatTtm / shares : null;
  const check = fin(tr) && tr !== 0 && fin(calc) ? r4(calc / tr - 1) : null;
  if (fin(tr) && tr !== 0) return { eps: Math.round(tr), source: "VND_EPS_TR", check, shares };
  if (fin(calc)) return { eps: Math.round(calc), source: "NPAT_SHARES", check: null, shares };
  if (tpl === "corp" && fin(sumEps) && sumEps !== 0) return { eps: Math.round(sumEps), source: "SUM_Q", check: null, shares };
  return { eps: null, source: null, check: null, shares };
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
