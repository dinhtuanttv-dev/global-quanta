// F5 (06/11/2026) — CHẤT LƯỢNG KQKD (EQ-v1) cho tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh. Hàm thuần, không I/O.
// Nguồn: BCTC quý VNDirect finfo đã lưu ở KV alpha:vnd (doanh thu 21001, LNST công ty mẹ 23000, kèm ngày công bố createdDate).
// Point-in-time: chỉ dùng quý đã công bố tới `today`.
//
//   • Tăng trưởng có kiểm soát (sửa lỗi "nền thấp" kiểu +41.509%): phân loại LỖ→LÃI, LÃI→LỖ, LỖ, NỀN THẤP (|kỳ gốc| < 5 tỷ hoặc
//     < 10% trung vị |LNST| 8 quý), còn lại tăng trưởng thường, giới hạn trong [−100%; +300%]. Nền thấp / đổi dấu không xếp hạng tăng trưởng.
//   • SUE — lợi nhuận bất ngờ chuẩn hoá theo bước ngẫu nhiên mùa vụ (Foster 1977; Bernard & Thomas 1989):
//     UE_q = LNST_q − LNST_{q−4}; SUE = UE_q / độ lệch chuẩn UE của 8 quý trước (cần ≥ 6). SUR tương tự cho doanh thu (Jegadeesh & Livnat 2006).
//   • Biên LNST quý (điểm %) so với cùng kỳ; tăng trưởng 4 quý (TTM); chuỗi quý liên tiếp LNST tăng so với cùng kỳ.
//   • Điểm tổng hợp 0–100 = bình quân có trọng số các hạng phần trăm chéo: SUE 40%, SUR 20%, LNST YoY 20%, DT YoY 10%, Δ biên 10%
//     (thiếu thành phần -> chia lại trọng số). Chỉ xếp hạng mã đã công bố QUÝ MỚI NHẤT của thị trường (không đem quý cũ so quý mới).
//     Trọng số đặt tay -> nhãn MÔ TẢ, chưa kiểm định đặt trước.
//   • Chất lượng lợi nhuận: mã NỀN THẤP không dùng SUE / LNST YoY trong điểm (quy mô chưa ổn định, SUE bị phóng đại); ghi chú khi LNST
//     tăng mạnh mà doanh thu không tăng tương ứng (có thể có khoản bất thường, không phải từ hoạt động kinh doanh).

export const EQ_VERSION = "EQ-v1 (2026-11-06)";
export const EQ = Object.freeze({
  lowBaseVnd: 5e9, lowBaseRel: 0.1, growthMin: -1, growthMax: 3, sueWindow: 8, sueMinObs: 6, spark: 8,
  weights: { sue: 0.4, sur: 0.2, npatYoY: 0.2, revYoY: 0.1, marginDelta: 0.1 },
});

const qIndex = (fiscal) => Math.ceil(Number(fiscal.slice(5, 7)) / 3);
const qKey = (fiscal) => `${fiscal.slice(0, 4)}-${qIndex(fiscal)}`;
const prevKey = (fiscal, back = 4) => { const y = Number(fiscal.slice(0, 4)), q = qIndex(fiscal); const n = y * 4 + (q - 1) - back; return `${Math.floor(n / 4)}-${(n % 4) + 1}`; };
export const quarterLabel = (fiscal) => `Q${qIndex(fiscal)}/${fiscal.slice(0, 4)}`;
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { if (a.length < 2) return null; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };

/**
 * Tăng trưởng có kiểm soát. Trả { value (đã giới hạn) | null, status }.
 * status: NORMAL · LOW_BASE · TURNAROUND (lỗ→lãi) · TO_LOSS (lãi→lỗ) · LOSS (lỗ cả hai kỳ) · NA
 */
export function robustGrowth(cur, prev, typicalAbs) {
  if (!fin(cur) || !fin(prev)) return { value: null, status: "NA" };
  if (prev <= 0 && cur > 0) return { value: null, status: "TURNAROUND" };
  if (prev > 0 && cur <= 0) return { value: null, status: "TO_LOSS" };
  if (prev <= 0 && cur <= 0) return { value: null, status: "LOSS" };
  const raw = (cur - prev) / prev;
  const value = Math.max(EQ.growthMin, Math.min(EQ.growthMax, raw));
  const low = prev < EQ.lowBaseVnd || (fin(typicalAbs) && typicalAbs > 0 && prev < EQ.lowBaseRel * typicalAbs);
  return { value, status: low ? "LOW_BASE" : "NORMAL", raw };
}

/** SUE của quý cuối trong `series` (giá trị theo quý, cùng thứ tự với `keys`), mô hình bước ngẫu nhiên mùa vụ. */
export function standardizedSurprise(byKey, fiscal) {
  const ue = (f) => { const a = byKey.get(qKey(f)), b = byKey.get(prevKey(f)); return fin(a) && fin(b) ? a - b : null; };
  const now = ue(fiscal);
  if (now == null) return null;
  const hist = [];
  for (let k = 1; k <= EQ.sueWindow; k++) {
    const key = prevKey(fiscal, k); const [y, q] = key.split("-").map(Number);
    const f = `${y}-${String(q * 3).padStart(2, "0")}-01`;
    const v = ue(f); if (v != null) hist.push(v);
  }
  if (hist.length < EQ.sueMinObs) return null;
  const s = sd(hist);
  return s && s > 0 ? now / s : null;
}

/** Một mã: các chỉ số của quý công bố gần nhất (≤ today). quarters: [{ fiscal, created, revenue, npat }]. */
export function tickerQuality(quarters, today) {
  const pub = (quarters ?? []).filter((q) => q.fiscal && (!q.created || q.created <= today));
  if (!pub.length) return null;
  const byQ = new Map(); for (const q of pub) byQ.set(qKey(q.fiscal), q); // bản công bố muộn hơn ghi đè (cùng quý)
  const qs = [...byQ.values()].sort((a, b) => a.fiscal.localeCompare(b.fiscal));
  const last = qs[qs.length - 1];
  const npat = new Map(qs.map((q) => [qKey(q.fiscal), q.npat])), rev = new Map(qs.map((q) => [qKey(q.fiscal), q.revenue]));
  const typical = median(qs.slice(-8).map((q) => q.npat).filter(fin).map(Math.abs));
  const prevN = npat.get(prevKey(last.fiscal)), prevR = rev.get(prevKey(last.fiscal));
  const npatYoY = robustGrowth(last.npat, prevN, typical);
  const revYoY = robustGrowth(last.revenue, prevR, median(qs.slice(-8).map((q) => q.revenue).filter(fin).map(Math.abs)));
  const margin = (n, r) => (fin(n) && fin(r) && r > 0 ? n / r : null);
  const mNow = margin(last.npat, last.revenue), mPrev = margin(prevN, prevR);
  const ttm = (endIdx) => { const s = qs.slice(Math.max(0, endIdx - 3), endIdx + 1); return s.length === 4 && s.every((q) => fin(q.npat)) ? s.reduce((a, q) => a + q.npat, 0) : null; };
  const t0 = ttm(qs.length - 1), t1 = ttm(qs.length - 5);
  let streak = 0;
  for (let i = qs.length - 1; i >= 0 && streak < 8; i--) {
    const g = robustGrowth(qs[i].npat, npat.get(prevKey(qs[i].fiscal)), typical);
    if ((g.status === "NORMAL" || g.status === "LOW_BASE") && g.value > 0) streak++; else if (g.status === "TURNAROUND") streak++; else break;
  }
  return {
    fiscal: last.fiscal, quarter: quarterLabel(last.fiscal), publishedAt: last.created ?? null,
    revenue: fin(last.revenue) ? last.revenue : null, npat: fin(last.npat) ? last.npat : null,
    npatYoY: npatYoY.value, npatStatus: npatYoY.status, npatYoYRaw: npatYoY.raw ?? null,
    revYoY: revYoY.value, revStatus: revYoY.status,
    sue: standardizedSurprise(npat, last.fiscal), sur: standardizedSurprise(rev, last.fiscal),
    margin: mNow, marginDelta: mNow != null && mPrev != null ? mNow - mPrev : null,
    ttmYoY: robustGrowth(t0, t1, typical != null ? typical * 4 : null).value, streak,
    spark: qs.slice(-EQ.spark).map((q) => ({ q: quarterLabel(q.fiscal), npat: fin(q.npat) ? q.npat : null })),
    notes: qualityNotes(npatYoY, revYoY),
  };
}

/** Ghi chú chất lượng lợi nhuận (minh bạch vì sao một mã không được xếp theo tăng trưởng). */
function qualityNotes(n, r) {
  const out = [];
  if (n.status === "LOW_BASE") out.push(`LNST kỳ gốc thấp (< 5 tỷ hoặc < 10% mức thường lệ): tăng trưởng thô ${Math.round(n.raw * 100).toLocaleString("vi-VN")}% không dùng để xếp hạng`);
  if (n.status === "TURNAROUND") out.push("Từ lỗ sang lãi so với cùng kỳ");
  if (n.status === "TO_LOSS") out.push("Từ lãi sang lỗ so với cùng kỳ");
  if (n.status === "LOSS") out.push("Lỗ cả quý này và cùng kỳ");
  const nG = n.raw ?? n.value, rG = r.value;
  if (fin(nG) && nG >= 1 && fin(rG) && rG < 0.1) out.push("LNST tăng mạnh nhưng doanh thu không tăng tương ứng — có thể có khoản bất thường");
  return out;
}

/** Hạng phần trăm chéo (0–1) của các giá trị hữu hạn; null giữ null. */
function pctRanks(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => fin(v)).sort((a, b) => a[0] - b[0]);
  const out = values.map(() => null);
  const n = idx.length;
  let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const r = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5; for (let k = i; k <= j; k++) out[idx[k][1]] = r; i = j + 1; }
  return out;
}

/** Toàn danh mục: fund = { TICKER: quarters[] }. */
export function buildEarningsQuality(fund, { today, fetchedAt = null } = {}) {
  const rows = [];
  for (const [ticker, quarters] of Object.entries(fund ?? {})) { const r = tickerQuality(quarters, today); if (r) rows.push({ ticker, ...r }); }
  // Quý mới nhất của thị trường = quý xuất hiện nhiều nhất trong các quý công bố gần nhất.
  const freq = new Map(); for (const r of rows) freq.set(r.fiscal, (freq.get(r.fiscal) ?? 0) + 1);
  const latest = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
  const cur = rows.filter((r) => r.fiscal === latest);
  const growthOk = (r, k, s) => (r[s] === "NORMAL" ? r[k] : null);
  const comps = {
    sue: pctRanks(cur.map((r) => (r.npatStatus === "LOW_BASE" ? null : r.sue))), sur: pctRanks(cur.map((r) => r.sur)),
    npatYoY: pctRanks(cur.map((r) => growthOk(r, "npatYoY", "npatStatus"))), revYoY: pctRanks(cur.map((r) => growthOk(r, "revYoY", "revStatus"))),
    marginDelta: pctRanks(cur.map((r) => r.marginDelta)),
  };
  cur.forEach((r, i) => {
    let s = 0, w = 0;
    for (const [k, wk] of Object.entries(EQ.weights)) { const v = comps[k][i]; if (v != null) { s += wk * v; w += wk; } }
    r.score = w >= 0.4 && (comps.sue[i] != null || comps.npatYoY[i] != null) ? Math.round((s / w) * 1000) / 10 : null;
  });
  const ranked = cur.filter((r) => r.score != null).sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  for (const r of rows) { r.current = r.fiscal === latest; if (r.rank == null) r.rank = null; if (r.score === undefined) r.score = null; }
  const npatPos = cur.filter((r) => r.npatStatus === "NORMAL" || r.npatStatus === "LOW_BASE").map((r) => r.npatYoY);
  return {
    version: EQ_VERSION, label: "MÔ TẢ", asOf: today, fetchedAt, latestQuarter: latest ? quarterLabel(latest) : null, latestFiscal: latest,
    counts: {
      tickers: rows.length, reportedLatest: cur.length, ranked: ranked.length,
      turnaround: cur.filter((r) => r.npatStatus === "TURNAROUND").length, toLoss: cur.filter((r) => r.npatStatus === "TO_LOSS").length,
      lowBase: cur.filter((r) => r.npatStatus === "LOW_BASE").length, positiveSue: cur.filter((r) => r.sue != null && r.sue >= 2).length,
    },
    medianNpatYoY: median(npatPos.filter(fin)), shareNpatUp: npatPos.length ? npatPos.filter((v) => v > 0).length / npatPos.length : null,
    method: {
      weights: EQ.weights, lowBaseVnd: EQ.lowBaseVnd, lowBaseRel: EQ.lowBaseRel, growthCap: [EQ.growthMin, EQ.growthMax], sueWindow: EQ.sueWindow, sueMinObs: EQ.sueMinObs,
      noteVi: "SUE/SUR theo mô hình bước ngẫu nhiên mùa vụ (Foster 1977; Bernard & Thomas 1989; Jegadeesh & Livnat 2006). Tăng trưởng nền thấp / đổi dấu không xếp hạng. Trọng số điểm đặt tay — MÔ TẢ, chưa kiểm định đặt trước ở thị trường Việt Nam.",
    },
    rows: rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.ticker.localeCompare(b.ticker)),
  };
}
