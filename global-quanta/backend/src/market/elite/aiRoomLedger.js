// ARL-v1 (26/11/2026) — SỔ PHÁN QUYẾT PHÒNG HỌP AI: nền "tự học" của tab QUYẾT ĐỊNH › 3 (Ho-so-360-v2/25, B1 + B2).
//
// Vì sao: bản phân tích khoá snapshot của mỗi mã bị GHI ĐÈ khi sang phiên mới (local:ai-room:publication:v1:<mã>), nên không có lịch
// sử để học. Sổ này lưu mỗi bản (mã × phiên) theo đúng thời điểm, KHÔNG sửa về sau khi đã chấm, rồi chấm theo thị trường thật.
//
// KHÔNG đổi hợp đồng AI (schema claims-1.0 strict, câu lệnh, công cụ). Tín hiệu đo được lấy từ kết quả bộ kiểm luận điểm sẵn có:
//   cán cân bằng chứng = (số luận điểm phe thuận REFS_MATCHED) − (số luận điểm phe phản biện REFS_MATCHED), chỉ khi có đủ hai phe.
// Chấm: lợi suất giá điều chỉnh của mã trừ VN-Index, vào lệnh ở đóng cửa phiên d+1, ra ở d+1+h (h = 5/10/20 phiên). Phiên d+1 tăng
// sát trần (≥ 6,7%) coi như KHÔNG KHỚP lệnh mua -> không đưa vào thống kê. Câu hỏi then chốt: cán cân AI có THÊM giá trị so với
// chính danh mục Elite HL (mọi mã lõi) hay không — nên luôn báo kèm đường cơ sở.
// Nhãn: THĂM DÒ — chưa có kiểm định đăng ký trước; dưới 30 bản đã chấm ghi "CHƯA ĐỦ MẪU". Không đổi quy tắc danh mục Elite HL.
import { loadAdjustedSeries } from "./adjustedCloses.js";

export const ARL_VERSION = "ARL-v1 (26/11/2026)";
export const ARL = Object.freeze({ horizons: [5, 10, 20], entryLag: 1, limitUp: 0.067, maxEntries: 4000, minScored: 30, scoreEveryMs: 6 * 3_600_000 });
export const ARL_KEY = "local:ai-room:ledger:v1";
const SIDES = ["BULL", "BEAR", "JUDGE"];
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r6 = (x) => (fin(x) ? Math.round(x * 1e6) / 1e6 : null);

/** Thống kê một vai từ kết quả bộ kiểm luận điểm (parseAndValidateClaims). */
export function sideStats(result) {
  if (!result || !Array.isArray(result.claims)) return null;
  const c = result.claims, count = (f) => c.filter(f).length;
  return {
    n: c.length,
    matched: count((x) => x.validation === "REFS_MATCHED"),
    structural: count((x) => x.validation === "STRUCTURAL_ONLY"),
    rejected: count((x) => x.validation === "UNSUPPORTED" || x.validation === "MISREPRESENTED"),
    highUncertainty: count((x) => x.uncertainty === "HIGH"),
    classes: Object.fromEntries(["FACT", "ENGINE_OUTPUT", "STATISTICAL_RESULT", "MODEL_INTERPRETATION", "UNKNOWN"].map((k) => [k, count((x) => x.classification === k)])),
  };
}

/** Bản ghi sổ từ bản phân tích của vòng nền (chỉ trường cần để học; không giữ lời văn AI). */
export function ledgerEntry(ticker, record, now = Date.now()) {
  const snap = record?.projection?.snap ?? null;
  const sides = Object.fromEntries(SIDES.map((s) => [s, sideStats(record?.roles?.[s])]));
  const balance = sides.BULL && sides.BEAR ? sides.BULL.matched - sides.BEAR.matched : null;
  return {
    id: `${ticker}|${record.session}`, ticker, session: record.session, publication: record.publication ?? null,
    snapshotId: snap?.snapshotId ?? null, state: record.state ?? null,
    membership: snap?.funnel?.membership?.state ?? null, hlRank: snap?.funnel?.membership?.rank ?? null,
    sides, balance, recordedAt: new Date(now).toISOString(), results: {},
  };
}

/** Thêm / cập nhật bản ghi. Bản đã có kết quả chấm thì giữ nguyên (không sửa lịch sử). */
export function upsert(entries, entry, max = ARL.maxEntries) {
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) {
    if (Object.keys(entries[i].results ?? {}).length) return entries;
    const next = entries.slice(); next[i] = { ...entry, recordedAt: entries[i].recordedAt, updatedAt: entry.recordedAt }; return next;
  }
  const next = [...entries, entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Chấm các bản chưa đủ kỳ hạn. `series`: Map(mã -> [{date, closeAdj}]); `vn`: [[date, close]] (phiên VN-Index đã đóng = lịch giao dịch).
 * Trả mảng mới (bản đã chấm cho kỳ hạn nào thì không chấm lại kỳ hạn đó).
 */
export function scoreEntries(entries, series, vn, rules = ARL) {
  const cal = vn.map((r) => r[0]).sort(), vnBy = new Map(vn);
  const pos = new Map(cal.map((d, i) => [d, i]));
  return entries.map((e) => {
    const i = pos.get(e.session);
    if (i == null) return e;
    const px = new Map((series.get(e.ticker) ?? []).map((r) => [r.date, r.closeAdj]));
    const results = { ...(e.results ?? {}) };
    let changed = false;
    for (const h of rules.horizons) {
      if (results[h]) continue;
      const d0 = cal[i], d1 = cal[i + rules.entryLag], d2 = cal[i + rules.entryLag + h];
      if (!d1 || !d2) continue;
      const p0 = px.get(d0), p1 = px.get(d1), p2 = px.get(d2), v1 = vnBy.get(d1), v2 = vnBy.get(d2);
      if (!(p1 > 0 && p2 > 0 && v1 > 0 && v2 > 0)) continue;
      const limitUp = p0 > 0 && p1 / p0 - 1 >= rules.limitUp;
      const ret = p2 / p1 - 1, vnRet = v2 / v1 - 1;
      results[h] = { entry: d1, exit: d2, ret: r6(ret), vnRet: r6(vnRet), excess: r6(ret - vnRet), ...(limitUp ? { limitUp: true } : {}) };
      changed = true;
    }
    return changed ? { ...e, results } : e;
  });
}

/** Khoảng tin cậy Wilson (mặc định 90%) cho tỷ lệ k/n. */
export function wilson(k, n, z = 1.6449) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [r6((c - m) / d), r6((c + m) / d)];
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Tổng hợp theo kỳ hạn: đường cơ sở (mọi mã lõi), nhóm theo dấu cán cân, tỷ lệ cán cân đúng chiều, giá trị thêm của AI. */
export function summarize(entries, rules = ARL) {
  const byH = {};
  for (const h of rules.horizons) {
    const scored = entries.filter((e) => e.results?.[h] && !e.results[h].limitUp);
    const ex = (xs) => xs.map((e) => e.results[h].excess);
    const pos = scored.filter((e) => e.balance > 0), neg = scored.filter((e) => e.balance < 0), flat = scored.filter((e) => e.balance === 0);
    const directional = [...pos, ...neg];
    const right = directional.filter((e) => Math.sign(e.balance) === Math.sign(e.results[h].excess)).length;
    const base = mean(ex(scored));
    byH[h] = {
      n: scored.length, baseline: r6(base),
      positive: { n: pos.length, meanExcess: r6(mean(ex(pos))) }, negative: { n: neg.length, meanExcess: r6(mean(ex(neg))) }, flat: { n: flat.length, meanExcess: r6(mean(ex(flat))) },
      directional: directional.length, hitRate: directional.length ? r6(right / directional.length) : null, hitCi90: wilson(right, directional.length),
      valueAdd: pos.length && base != null ? r6(mean(ex(pos)) - base) : null,
    };
  }
  const n10 = byH[10]?.directional ?? 0;
  return {
    version: ARL_VERSION, total: entries.length, ready: entries.filter((e) => e.state === "READY").length,
    withBalance: entries.filter((e) => e.balance != null).length, horizons: byH,
    label: n10 >= rules.minScored ? "THĂM DÒ" : "CHƯA ĐỦ MẪU",
    labelVi: n10 >= rules.minScored
      ? "THĂM DÒ — chưa có kiểm định đăng ký trước; chỉ mô tả, không đổi quy tắc danh mục."
      : `CHƯA ĐỦ MẪU — cần ≥ ${rules.minScored} bản có cán cân đã chấm ở kỳ hạn 10 phiên (hiện ${n10}).`,
    methodVi: "Cán cân = luận điểm phe thuận có ref khớp − phe phản biện có ref khớp. Lợi suất giá điều chỉnh, vào ở đóng cửa phiên kế tiếp, trừ VN-Index; phiên vào tăng sát trần bị loại. Đường cơ sở = mọi mã lõi có bản phân tích.",
  };
}

/** Dịch vụ: ghi (gọi từ vòng nền), chấm (định kỳ, có giới hạn tần suất), đọc (route công khai — không có dữ liệu cá nhân). */
export function createAiRoomLedger({ store, adjustedCloses = null, vnIndex, now = Date.now, log = console, rules = ARL }) {
  let chain = Promise.resolve(), lastScored = 0, scoring = null;
  const load = async () => (await store.getKv(ARL_KEY))?.value ?? { version: ARL_VERSION, entries: [] };
  const save = (doc) => store.setKv(ARL_KEY, { ...doc, version: ARL_VERSION, updatedAt: new Date(now()).toISOString() });
  const serial = (fn) => (chain = chain.then(fn, fn));
  return {
    record(ticker, rec) {
      if (!rec?.session || !rec?.projection) return Promise.resolve();
      return serial(async () => { const doc = await load(); await save({ ...doc, entries: upsert(doc.entries ?? [], ledgerEntry(ticker, rec, now()), rules.maxEntries) }); })
        .catch((e) => log.warn?.(`[ai-room-ledger] ghi ${ticker}: ${e.message}`));
    },
    score({ force = false } = {}) {
      if (scoring) return scoring;
      if (!force && now() - lastScored < rules.scoreEveryMs) return Promise.resolve(null);
      scoring = serial(async () => {
        const doc = await load(), entries = doc.entries ?? [];
        const pending = entries.filter((e) => rules.horizons.some((h) => !e.results?.[h]));
        lastScored = now();
        if (!pending.length) return summarize(entries, rules);
        const vn = await vnIndex();
        const from = pending.map((e) => e.session).sort()[0], to = vn.length ? vn[vn.length - 1][0] : from;
        const series = await loadAdjustedSeries({ adjustedCloses, store, symbols: [...new Set(pending.map((e) => e.ticker))], from, to, log });
        const next = scoreEntries(entries, series, vn, rules);
        await save({ ...doc, entries: next });
        return summarize(next, rules);
      }).catch((e) => { log.warn?.(`[ai-room-ledger] chấm: ${e.message}`); return null; }).finally(() => { scoring = null; });
      return scoring;
    },
    async read({ ticker = null, limit = 60 } = {}) {
      const doc = await load(), entries = doc.entries ?? [];
      const list = (ticker ? entries.filter((e) => e.ticker === ticker) : entries).slice(-Math.min(Math.max(1, Number(limit) || 60), 200)).reverse();
      return { version: ARL_VERSION, rules, updatedAt: doc.updatedAt ?? null, summary: summarize(entries, rules), entries: list };
    },
  };
}
