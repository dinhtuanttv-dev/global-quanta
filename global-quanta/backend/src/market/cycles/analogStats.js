// Tóm tắt các giai đoạn tương tự cho bảng Top 20: trung vị và dải 10–90% có trọng số của lợi suất vượt VN-Index, kiểm tra biên độ.
// Cùng công thức với giao diện tab Cycle Fingerprint (src/components/MainTabs/LocNganh/cycleAnalogStats.ts). Mô tả lịch sử, không phải dự báo.
export const AMPLITUDE_RATIO = 2;
export const AMPLITUDE_MIN_PCT = 15;

/** Phân vị có trọng số: giá trị nhỏ nhất có tổng trọng số luỹ kế đạt q. */
export function weightedQuantile(items, q) {
  const s = items.filter((x) => Number.isFinite(x.v) && x.w > 0).sort((a, b) => a.v - b.v);
  if (!s.length) return null;
  const total = s.reduce((a, x) => a + x.w, 0);
  let cum = 0;
  for (const x of s) { cum += x.w; if (cum >= q * total - 1e-12) return x.v; }
  return s[s.length - 1].v;
}

export const windowMovePct = (pattern) => (pattern?.length >= 2 && pattern[0] > 0 ? (pattern[pattern.length - 1] / pattern[0] - 1) * 100 : null);
export const amplitudeMismatch = (cur, nb) => cur != null && nb != null && Math.abs(nb) > AMPLITUDE_MIN_PCT && Math.abs(nb) >= AMPLITUDE_RATIO * Math.abs(cur);

/** Từ kết quả truy vấn một mã (queryCycles) tới dòng tóm tắt gọn. */
export function analogSummary(q, key = "d20") {
  const items = (q.neighbors ?? []).flatMap((n) => { const v = n.excess?.[key]; return v == null ? [] : [{ v, w: n.weight ?? 1 }]; });
  const total = items.reduce((a, x) => a + x.w, 0);
  const move = windowMovePct(q.current?.pattern);
  return {
    symbol: q.symbol, asOf: q.asOf, n: items.length,
    median: weightedQuantile(items, 0.5), p10: weightedQuantile(items, 0.1), p90: weightedQuantile(items, 0.9),
    shareUp: total > 0 ? Math.round((items.filter((x) => x.v > 0).reduce((a, x) => a + x.w, 0) / total) * 1000) / 1000 : null,
    move: move == null ? null : Math.round(move * 100) / 100,
    mismatched: (q.neighbors ?? []).filter((n) => amplitudeMismatch(move, windowMovePct(n.pattern))).length,
    neighbors: q.neighbors?.length ?? 0, nEff: q.forecast?.nEff ?? null,
  };
}
