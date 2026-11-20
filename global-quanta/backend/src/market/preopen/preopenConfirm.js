// PO-r2-F (PO-r2-F-prereg.md): xác nhận tiến cho dải cả phiên + thống kê mô tả của sổ tiến.
// Hàm thuần, chỉ đọc sổ; không đổi cách ghi hay cách chấm.

export const CONFIRM_RULE = Object.freeze({ rule: "PO-r2-F", need: 60, lo: 72, hi: 88, target: 80, from: "2026-11-02", registered: "2026-11-21" });

const round = (v, n = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

/** Khoảng tin cậy Wilson (mặc định 95%) cho k/n, đơn vị phần trăm. */
export function wilson(k, n, z = 1.96) {
  if (!n || n <= 0) return null;
  const p = k / n, z2 = z * z, den = 1 + z2 / n, center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, (center - half) * 100), hi: Math.min(100, (center + half) * 100) };
}

/** Tỷ lệ + KTC cho một điều kiện trên danh sách phiên đã chấm. */
export function rate(days, pick) {
  const n = days.length, k = days.filter(pick).length, ci = wilson(k, n);
  return { n, k, pct: n ? round((k / n) * 100) : null, lo: ci ? round(ci.lo) : null, hi: ci ? round(ci.hi) : null };
}

/** Các phiên đã chấm, xếp theo ngày tăng dần. */
export const scoredDays = (ledger) => Object.entries(ledger?.days ?? {}).filter(([, d]) => d?.score).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, ...d }));

/**
 * Trạng thái PO-r2-F. Kết luận dùng đúng 60 phiên chấm đầu tiên (từ 02/11/2026), một lần;
 * trước đó là "confirming". Kèm mẫu phụ (chỉ phiên chấm sau ngày đăng ký) để mô tả.
 */
export function evaluateConfirm(ledger, rule = CONFIRM_RULE) {
  const all = scoredDays(ledger).filter((d) => d.date >= rule.from);
  const sample = all.slice(0, rule.need), cov = rate(sample, (d) => d.score.dayIn);
  let status = "confirming";
  if (sample.length >= rule.need) {
    const inRange = cov.pct >= rule.lo && cov.pct <= rule.hi, covers = cov.lo <= rule.target && cov.hi >= rule.target;
    status = inRange && covers ? "passed" : "failed";
  }
  const after = rate(all.filter((d) => d.date > rule.registered), (d) => d.score.dayIn);
  return { rule: rule.rule, need: rule.need, n: cov.n, coverage: cov.pct, wilsonLo: cov.lo, wilsonHi: cov.hi, range: [rule.lo, rule.hi], target: rule.target, status, decidedOn: sample.length >= rule.need ? sample.at(-1).date : null, afterRegistration: after };
}

/** Mô tả: kịch bản khớp ES đúng lớp kết quả, so với luôn đoán Trung tính trên cùng phiên (chỉ phiên có kịch bản khớp). */
export function leadVsBaseline(ledger) {
  const days = scoredDays(ledger).filter((d) => d.slots?.[d.score.slot]?.lead != null);
  return { lead: rate(days, (d) => d.score.leadHit), alwaysMid: rate(days, (d) => d.score.outcome === "mid") };
}

/** Từng phiên đã chấm, mới nhất trước. Chỉ trả số đã hiện công khai (dải cả phiên), không trả vùng mở cửa / xác suất bị ẩn. */
export function ledgerRows(ledger, limit = 60) {
  return scoredDays(ledger).reverse().slice(0, Math.max(1, Math.min(250, limit))).map((d) => {
    const snap = d.slots?.[d.score.slot] ?? null, lead = snap?.lead ?? null, band = lead ? snap.shadow?.find((s) => s.id === lead)?.day ?? null : null;
    return { date: d.date, slot: d.score.slot, es: snap?.es ?? null, lead, day: band, prevClose: d.prevClose ?? null, open: d.score.open, close: d.score.close, gapPct: d.score.gapPct, ccPct: d.score.ccPct, outcome: d.score.outcome, dayIn: d.score.dayIn, leadHit: d.score.leadHit };
  });
}
