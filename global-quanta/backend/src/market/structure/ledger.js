// Cấu trúc đa khung (T6) — SỔ DỰ BÁO THỰC TẾ + hiệu chỉnh trực tuyến Adaptive Conformal Inference (Gibbs & Candès 2021).
//   - Mỗi phiên (job 15:47): ghi cho từng mã giai đoạn, kết luận, và khoảng dự báo THÔ (log-lợi suất, trước hiệu chỉnh) 5/10/20 phiên.
//   - Khi đủ h phiên: lợi suất thực y = log(đóng cửa d+h / đóng cửa d) trên chuỗi điều chỉnh HIỆN TẠI (hai đầu cùng hệ số),
//     điểm không phù hợp s = max(lo − y, y − hi). Trượt = y ngoài khoảng đã công bố. ACI: α ← α + γ(α* − tỷ lệ trượt của phiên).
//   - Độ rộng hiệu chỉnh mới = phân vị (1 − α) của 500 điểm s gần nhất -> nón trên biểu đồ tự rộng / hẹp theo độ phủ thực tế.
// Lưu trên Railway Volume (tệp JSON nén theo tháng) — không dùng Supabase/Neon.
export const LEDGER_HORIZONS = [5, 10, 20];
export const ACI = Object.freeze({ target: 0.2, gamma: 0.005, window: 500, minScores: 50, alphaMin: 0.01, alphaMax: 0.6 });

const monthOf = (date) => `ledger-${date.slice(0, 7)}`;
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

export function emptyAciState() {
  return { alpha: Object.fromEntries(LEDGER_HORIZONS.map((h) => [h, ACI.target])), scores: Object.fromEntries(LEDGER_HORIZONS.map((h) => [h, []])),
    offset: {}, scoredThrough: {}, history: [], verdicts: {}, updatedAt: null };
}

/** Phân vị thực nghiệm (nội suy bậc thang trên). */
export function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/**
 * Chấm các bản ghi đã đủ kỳ hạn và cập nhật trạng thái ACI (hàm thuần).
 * @param state       trạng thái ACI (emptyAciState)
 * @param entriesByDate  { [date]: [{ t, st, v, cone: { [h]: [lo0, hi0, offUsed] } | null }] } — các phiên đã ghi, mọi tháng cần chấm
 * @param seriesOf    (ticker) => { dates: string[], close: number[], idx: Map<date, i> } | null
 */
export function scoreLedger(state, entriesByDate, seriesOf) {
  const next = structuredClone(state);
  const dates = Object.keys(entriesByDate).sort();
  const verdictAcc = next.verdicts ?? {};
  for (const h of LEDGER_HORIZONS) {
    for (const d of dates) {
      if (next.scoredThrough[h] && d <= next.scoredThrough[h]) continue;
      // Phiên chỉ được chấm khi MỌI mã có dữ liệu đã đủ kỳ hạn (không chấm dở dang, không đếm trùng).
      const ready = entriesByDate[d].every((e) => { const s = seriesOf(e.t), i = s?.idx.get(d); return i == null || i + h < s.close.length; });
      if (!ready) break;
      let n = 0, miss = 0;
      const scores = [];
      for (const e of entriesByDate[d]) {
        const s = seriesOf(e.t);
        const i = s?.idx.get(d);
        if (i == null) continue;
        const y = Math.log(s.close[i + h] / s.close[i]);
        if (h === 10 && e.v) { const a = verdictAcc[e.v] ?? { n: 0, sum: 0, recent: [] }; a.n++; a.sum += y; a.recent = [...a.recent, { d, y: r4(y) }].slice(-200); verdictAcc[e.v] = a; }
        const c = e.cone?.[h];
        if (!c) continue;
        const [lo0, hi0, off] = c;
        n++;
        if (y < lo0 - off || y > hi0 + off) miss++;
        scores.push(Math.max(lo0 - y, y - hi0));
      }
      next.scoredThrough[h] = d;
      if (!n) continue;
      const rate = miss / n;
      next.alpha[h] = Math.min(ACI.alphaMax, Math.max(ACI.alphaMin, next.alpha[h] + ACI.gamma * (ACI.target - rate)));
      next.scores[h] = [...next.scores[h], ...scores.map(r4)].slice(-ACI.window);
      if (next.scores[h].length >= ACI.minScores) next.offset[h] = r4(quantile(next.scores[h], 1 - next.alpha[h]));
      next.history = [...next.history, { d, h, n, coverage: r4(1 - rate), alpha: r4(next.alpha[h]) }].slice(-600);
    }
  }
  next.verdicts = verdictAcc;
  return next;
}

/** Thống kê hiển thị: độ phủ thực tế 60 phiên gần nhất theo kỳ hạn, α hiện tại, lợi suất TB 10 phiên theo kết luận. */
export function ledgerStats(state) {
  const cov = {};
  for (const h of LEDGER_HORIZONS) {
    const rows = state.history.filter((x) => x.h === h).slice(-60);
    const n = rows.reduce((a, x) => a + x.n, 0);
    cov[h] = { sessions: rows.length, forecasts: n, coverage: n ? r4(rows.reduce((a, x) => a + x.coverage * x.n, 0) / n) : null, alpha: r4(state.alpha[h]), offset: state.offset[h] ?? null, through: state.scoredThrough[h] ?? null };
  }
  const verdicts = Object.fromEntries(Object.entries(state.verdicts ?? {}).map(([v, a]) => [v, { n: a.n, meanRet10: a.n ? r4(Math.exp(a.sum / a.n) - 1) : null, recentN: a.recent.length }]));
  return { target: 1 - ACI.target, coverage: cov, verdicts, updatedAt: state.updatedAt };
}

/** Lưu trữ trên đĩa qua kho của dịch vụ cấu trúc (readJson / writeJson). */
export function createStructureLedger({ store: disk, now = Date.now }) {
  let state = null;
  async function load() {
    if (!state) state = (await disk.readJson("aci")) ?? emptyAciState();
    return state;
  }
  return {
    async state() { return load(); },
    /** Offset ACI hiện hành theo kỳ hạn (null -> dùng offset hiệu chỉnh của kiểm định). */
    async offsets() { const s = await load(); return s.offset ?? {}; },
    async record(date, rows) {
      const name = monthOf(date);
      const doc = (await disk.readJson(name)) ?? { entries: {} };
      doc.entries[date] = rows;
      await disk.writeJson(name, doc);
      return rows.length;
    },
    /** Chấm mọi phiên chưa chấm (tối đa 3 tháng gần nhất) theo chuỗi giá hiện tại. */
    async score(seriesOf, today) {
      const s = await load();
      const months = [];
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      for (let k = 0; k < 3; k++) { months.unshift(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); }
      const entries = {};
      for (const m of months) Object.assign(entries, (await disk.readJson(`ledger-${m}`))?.entries ?? {});
      state = { ...scoreLedger(s, entries, seriesOf), updatedAt: new Date(now()).toISOString() };
      await disk.writeJson("aci", state);
      return ledgerStats(state);
    },
    async stats() { return ledgerStats(await load()); },
  };
}
