// "Đà tăng tiếp diễn" (cờ Quá đà) — SỔ THỜI GIAN THỰC cho giả thuyết đặt trước M1 (MTF-momentum-prereg.md).
//   - Ghi (job scanStructure 15:47, phiên d đã đóng): trong các mã đủ điều kiện có giai đoạn ngày UP / B -> nhóm BẬT (cờ quá đà +1)
//     và nhóm TẮT; kèm danh sách mọi mã đủ điều kiện (để tính chuẩn thị trường). Đã ghi thì không sửa.
//   - Chấm khi có nến d+20: lợi suất mở cửa d+1 -> đóng cửa d+20, vượt trội so với TB mọi mã đủ điều kiện; S_d = BẬT − TẮT,
//     L_d = BẬT − phí 0,6%. Phiên cần ≥ 3 mã mỗi nhóm.
//   - Kết luận: ≥ 120 phiên đã chấm; TB S > 0, cận dưới KTC 95% bootstrap khối dịch chuyển (khối 20) > 0, TB L > 0.
// Lưu trên Railway Volume qua readJson / writeJson của kho cấu trúc — không dùng Supabase / Neon.
export const MOMENTUM_PREREG = Object.freeze({
  version: "structure/MTF-momentum-prereg-2026-10-24", horizon: 20, feePct: 0.6, minGroup: 3, minDays: 120, confirmDays: 240,
  block: 20, iters: 2000, seed: 7, stages: ["UP", "B"],
  startFrom: "2026-10-26", // phiên giao dịch đầu tiên sau triển khai — dữ liệu trước đó KHÔNG vào sổ
});
const P = MOMENTUM_PREREG;
const FILE = "momentum-ledger";
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export const emptyMomentumState = () => ({ prereg: P.version, firstDay: null, days: {}, scored: {}, updatedAt: null });

/** Ghi một phiên (không ghi đè phiên đã có — sổ không sửa về sau). rows: [{ t, st, ext, elig }]. */
export function recordDay(state, d, rows) {
  if (state.days[d] || d < P.startFrom) return state;
  const all = rows.filter((r) => r.elig).map((r) => r.t);
  const base = rows.filter((r) => r.elig && P.stages.includes(r.st));
  const next = { ...state, days: { ...state.days, [d]: { on: base.filter((r) => r.ext > 0).map((r) => r.t), off: base.filter((r) => !(r.ext > 0)).map((r) => r.t), all } } };
  next.firstDay = next.firstDay && next.firstDay < d ? next.firstDay : d;
  return next;
}

/**
 * Chấm mọi phiên đã đủ d+20 (hàm thuần).
 * @param seriesOf (ticker) => { open: number[], close: number[], idx: Map<date, i> } | null — chuỗi điều chỉnh HIỆN HÀNH
 */
export function scoreDays(state, seriesOf) {
  const scored = { ...state.scored };
  const H = P.horizon;
  const ret = (t, d) => {
    const s = seriesOf(t), i = s?.idx.get(d);
    if (i == null || i + H >= s.close.length || !(s.open[i + 1] > 0)) return undefined;
    return (s.close[i + H] / s.open[i + 1] - 1) * 100;
  };
  for (const [d, g] of Object.entries(state.days).sort(([a], [b]) => a.localeCompare(b))) {
    if (scored[d]) continue;
    const all = g.all.map((t) => ret(t, d));
    const known = g.all.filter((t) => seriesOf(t)?.idx.get(d) != null).length;
    const have = all.filter((x) => x !== undefined).length;
    if (!known || have < 0.9 * known) continue; // chưa đủ nến d+20 (không chấm dở dang)
    const bench = mean(all.filter((x) => x !== undefined));
    const ex = (list) => list.map((t) => ret(t, d)).filter((x) => x !== undefined).map((x) => x - bench);
    const on = ex(g.on), off = ex(g.off);
    const ok = on.length >= P.minGroup && off.length >= P.minGroup;
    scored[d] = { nOn: on.length, nOff: off.length, on: r3(mean(on)), off: r3(mean(off)), S: ok ? r3(mean(on) - mean(off)) : null, L: ok ? r3(mean(on) - P.feePct) : null };
  }
  return { ...state, scored };
}

/** Bootstrap khối dịch chuyển cho TB của chuỗi theo thời gian (kỳ hạn chồng nhau). */
export function blockBootstrapCi(xs, { block = P.block, iters = P.iters, seed = P.seed } = {}) {
  const n = xs.length;
  if (n < 2) return null;
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const b = Math.min(block, n), starts = n - b + 1, ms = [];
  for (let k = 0; k < iters; k++) {
    let s = 0, c = 0;
    while (c < n) { const st = Math.floor(rnd() * starts); for (let j = 0; j < b && c < n; j++, c++) s += xs[st + j]; }
    ms.push(s / n);
  }
  ms.sort((x, y) => x - y);
  return [r3(ms[Math.floor(0.025 * iters)]), r3(ms[Math.floor(0.975 * iters)])];
}

/** Thống kê + kết luận theo tiêu chí đặt trước. */
export function momentumStats(state) {
  const rows = Object.entries(state.scored).filter(([, v]) => v.S != null).sort(([a], [b]) => a.localeCompare(b));
  const S = rows.map(([, v]) => v.S), L = rows.map(([, v]) => v.L);
  const n = rows.length;
  const ci = blockBootstrapCi(S);
  const mS = mean(S), mL = mean(L);
  const judge = (k) => {
    const s = S.slice(0, k), l = L.slice(0, k), c = blockBootstrapCi(s);
    return mean(s) > 0 && c && c[0] > 0 && mean(l) > 0 ? "PASS" : "FAIL";
  };
  const verdict = n < P.minDays ? "PENDING" : judge(P.minDays);
  const recorded = Object.keys(state.days).length;
  const last = Object.entries(state.days).sort(([a], [b]) => b.localeCompare(a))[0];
  return {
    prereg: P.version, firstDay: state.firstDay, recordedDays: recorded, scoredDays: n, pendingDays: recorded - Object.keys(state.scored).length,
    minDays: P.minDays, meanS: r3(mS), ciS: ci, meanL: r3(mL), hitS: n ? r3((S.filter((x) => x > 0).length / n) * 100) : null,
    meanOn: r3(mean(rows.map(([, v]) => v.on))), meanOff: r3(mean(rows.map(([, v]) => v.off))),
    lastGroup: last ? { d: last[0], on: last[1].on.length, off: last[1].off.length } : null,
    verdict, confirm: n >= P.confirmDays ? judge(P.confirmDays) : null,
    label: verdict === "PASS" ? "ĐÃ KIỂM ĐỊNH (sổ thực)" : verdict === "FAIL" ? "KHÔNG ĐẠT (sổ thực)" : "ĐANG TÍCH LŨY MẪU",
    updatedAt: state.updatedAt,
  };
}

export function createMomentumLedger({ disk, now = Date.now }) {
  let state = null;
  const load = async () => (state ??= (await disk.readJson(FILE)) ?? emptyMomentumState());
  return {
    /** Ghi phiên d rồi chấm mọi phiên đủ kỳ hạn; trả thống kê. */
    async update(d, rows, seriesOf) {
      let s = await load();
      if (d) s = recordDay(s, d, rows);
      s = { ...scoreDays(s, seriesOf), updatedAt: new Date(now()).toISOString() };
      state = s;
      await disk.writeJson(FILE, s);
      return momentumStats(s);
    },
    async stats() { return momentumStats(await load()); },
    /** Nhóm BẬT của phiên ghi gần nhất (để giao diện cho biết mã đang nằm trong sổ). */
    async latestOn() { const s = await load(); const k = Object.keys(s.days).sort().pop(); return k ? { d: k, on: s.days[k].on } : null; },
  };
}
