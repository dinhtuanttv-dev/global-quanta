// Lõi Trung tâm vĩ mô (chạy trong worker thread của Gateway, hoặc trực tiếp trong test).
// Nguyên tắc dữ liệu: KHÔNG BAO GIỜ trộn số liệu thật với số liệu mô phỏng.
//   - Chế độ "real": chỉ khi kho số liệu THẬT (nạp CSV qua route admin + chuỗi chỉ số HOSE lấy từ Gateway) có >= 1 biến vĩ mô
//     VÀ >= 1 chỉ số với tối thiểu 60 tháng. Engine chỉ thấy kho thật, không có biểu ngữ mô phỏng.
//   - Ngược lại: chế độ "insufficient" — engine vẫn chạy trên kho THẬT (có thể rỗng), phép tính thiếu số liệu trả 422 kèm lý do.
//     Không bao giờ dựng kho mô phỏng (bỏ makeSyntheticStore 05/11/2026): thà báo thiếu dữ liệu còn hơn hiện số giả.
import {
  createMacroApi, createMacroChatTools, InMemoryVintageStore, VN_CATALOG, SYNTHETIC_NOTICE,
  importSeriesCsv, checkQuality, catalogById, MACRO_TOOL_SPECS, MACRO_CHAT_SYSTEM_PROMPT, toAnthropicTools,
} from "./vendor/macroEngine.mjs";
import { quarantineScale } from "./scaleCheck.js";

export const MIN_MONTHS = 60;
/** Chuỗi mức dương (giá, chỉ số, tỷ giá, sản lượng) — áp kiểm tra lệch thang đo; chuỗi tỷ lệ (%, điểm PMI) không áp. */
export const isLevelSeries = (id) => ["level", "index"].includes(BY_ID[id]?.kind);
const BY_ID = catalogById(VN_CATALOG);
const obsKey = (o) => `${o.seriesId}|${o.period}|${o.asOf}`;

const spKey = (o) => `${o.seriesId}|${o.period}`;
const pick = (o, asOf = o.asOf) => ({ seriesId: o.seriesId, period: o.period, value: o.value, asOf, ...(o.source ? { source: o.source } : {}) });

/**
 * Gộp quan sát mới vào danh sách cũ.
 * V1 (19/11/2026): trước đây khoá (seriesId, period, asOf) với asOf SUY TỪ kỳ -> nguồn công bố lại một con số thì bản cũ bị GHI ĐÈ
 * (mất lịch sử "biết gì, vào ngày nào"). Nay với nguồn có công bố lại (`revisable(o)`: IMF CPI, FRED FEDFUNDS, CSV) và `todayIso`:
 * giá trị khác bản mới nhất của kỳ -> thêm VINTAGE mới với asOf = hôm nay (ngày Gateway thấy nó lần đầu); bản cũ giữ nguyên, engine
 * truy vấn theo asOf vẫn thấy đúng con số đã biết ở quá khứ. Nguồn không công bố lại (giá thị trường) -> ghi đè như cũ (thay đổi = sửa lỗi).
 * Không truyền opts -> hành vi cũ.
 */
export function mergeObservations(existing, incoming, { revisable = null, todayIso = null, correction = false } = {}) {
  const map = new Map(existing.map((o) => [obsKey(o), o]));
  const latest = new Map();
  for (const o of existing) {
    const l = latest.get(spKey(o));
    if (!l || o.asOf > l.asOf) latest.set(spKey(o), o);
  }
  let added = 0;
  let changed = 0;
  let revised = 0;
  for (const o of incoming) {
    const cur = latest.get(spKey(o));
    // sửa LỖI NHẬP: thay hẳn bản mới nhất của kỳ (kể cả khi asOf khác) — bản sai không được giữ làm vintage
    if (correction && cur) {
      if (cur.value === o.value && cur.asOf === o.asOf) continue;
      map.delete(obsKey(cur));
      const rec = pick(o);
      map.set(obsKey(rec), rec);
      latest.set(spKey(rec), rec);
      changed++;
      continue;
    }
    if (revisable && todayIso && cur && revisable(o)) {
      if (cur.value === o.value) continue;
      const rec = pick(o, todayIso > o.asOf ? todayIso : o.asOf);
      if (map.get(obsKey(rec))?.value === rec.value) continue;
      map.set(obsKey(rec), rec);
      latest.set(spKey(rec), rec);
      revised++;
      continue;
    }
    const k = obsKey(o);
    const prev = map.get(k);
    if (!prev) added++;
    else if (prev.value !== o.value) changed++;
    else continue;
    map.set(k, pick(o));
    if (!cur || o.asOf >= cur.asOf) latest.set(spKey(o), map.get(k));
  }
  const list = [...map.values()].sort((a, b) => (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : a.period < b.period ? -1 : a.period > b.period ? 1 : a.asOf < b.asOf ? -1 : 1));
  return { list, added, changed, revised };
}

/** Bản mới nhất của mỗi (seriesId, period) — cho bên dùng cần một giá trị/kỳ (Kết nối thế giới, đếm độ phủ). */
export function latestPerPeriod(list) {
  const latest = new Map();
  for (const o of list) {
    const l = latest.get(spKey(o));
    if (!l || o.asOf > l.asOf) latest.set(spKey(o), o);
  }
  return [...latest.values()];
}

/** Số kỳ có hơn một vintage (đã được nguồn công bố lại) theo chuỗi. */
export function vintageCounts(list) {
  const per = new Map();
  for (const o of list) per.set(spKey(o), (per.get(spKey(o)) ?? 0) + 1);
  const out = {};
  for (const [k, n] of per) if (n > 1) { const id = k.split("|")[0]; out[id] = (out[id] ?? 0) + 1; }
  return out;
}

const monthsBetween = (a, b) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
/** Ngưỡng "ngừng cập nhật": độ trễ công bố của chuỗi + 3 tháng (VD chỉ số đổi mã, nguồn ngừng). */
export const STALE_GRACE_MONTHS = 3;

/**
 * Độ phủ của kho số liệu thật. Chuỗi NGỪNG CẬP NHẬT (kỳ cuối cũ hơn độ trễ công bố + 3 tháng) bị loại khỏi phân tích:
 * engine lấy GIAO các kỳ của mọi chuỗi, một chuỗi dừng sẽ kéo cả ma trận/cảnh báo về quá khứ mà vẫn trông như "hiện tại".
 */
export function coverageOf(store, todayIso) {
  const nowPeriod = (todayIso ?? new Date().toISOString()).slice(0, 7);
  const series = VN_CATALOG.map((m) => {
    const pts = store.getSeries(m.id);
    const last = pts.at(-1)?.period ?? null;
    const lagMonths = last ? monthsBetween(last, nowPeriod) : null;
    const stale = last != null && lagMonths > (m.pubLagMonths ?? 0) + 1 + STALE_GRACE_MONTHS;
    return { id: m.id, nameVi: m.nameVi, role: m.role, n: pts.length, first: pts[0]?.period ?? null, last, stale };
  });
  const ok = (role) => series.filter((s) => s.role === role && s.n >= MIN_MONTHS && !s.stale).map((s) => s.id);
  const factors = ok("factor");
  const targets = ok("target");
  return { series, usableFactors: factors, usableTargets: targets, staleSeries: series.filter((s) => s.stale).map((s) => s.id), realReady: factors.length > 0 && targets.length > 0 };
}

/**
 * MacroScore CHỈ ĐỂ THAM KHẢO (quyết định dự án 2026-10-16): không bao giờ trả usableForDecisions = true.
 * Kết quả cổng kiểm định (backtest.gate) vẫn giữ nguyên để minh bạch; trên dữ liệu mô phỏng cổng "đạt" là vô nghĩa.
 */
export function referenceOnly(res, mode) {
  const b = res?.body;
  // báo cáo tháng (Markdown) được dựng trong engine, không đi qua lớp này -> sửa câu kết luận cổng ngay trong văn bản
  if (b && typeof b === "object" && typeof b.markdown === "string") {
    const note = "MacroScore CHỈ ĐỂ THAM KHẢO (chưa qua kiểm định đặt trước), không dùng cho quyết định.";
    return { ...res, body: { ...b, markdown: b.markdown.replace(/MacroScore (CHƯA )?vượt cổng kiểm định ngoài mẫu[^.\n]*\./g, (m) => `${m} Lưu ý: ${note}`) } };
  }
  if (!b || typeof b !== "object" || !("usableForDecisions" in b)) return res;
  const passed = !!b.backtest?.gate?.pass;
  const gateNote = passed
      ? "MacroScore vượt cổng kiểm định ngoài mẫu của gói, nhưng CHỈ ĐỂ THAM KHẢO — chưa qua kiểm định đặt trước, không đưa vào quyết định."
      : "MacroScore CHƯA vượt cổng kiểm định; chỉ dùng để tham khảo, không đưa vào bộ máy quyết định.";
  return { ...res, body: { ...b, usableForDecisions: false, gatePassed: passed, gateNote, evidence: "REFERENCE_ONLY" } };
}

/** Ngày hiện tại theo giờ Việt Nam (UTC+7) — asOf mặc định của engine. */
export const vnToday = (now = Date.now()) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);

export function createMacroCore({ today = () => vnToday() } = {}) {
  let real = [];
  let state = null;

  function rebuild() {
    // V0: cổng chất lượng — điểm lệch thang đo (×100, ÷10.000…) của chuỗi mức bị cách ly khỏi engine, công bố ở /source.quarantined
    const gate = quarantineScale(real, isLevelSeries);
    const clean = gate.keep;
    const all = new InMemoryVintageStore();
    if (clean.length) all.upsert(clean);
    const coverage = coverageOf(all, today());
    // engine chỉ thấy các chuỗi còn cập nhật
    const realStore = new InMemoryVintageStore();
    const stale = new Set(coverage.staleSeries);
    const fresh = clean.filter((o) => !stale.has(o.seriesId));
    if (fresh.length) realStore.upsert(fresh);
    const mode = coverage.realReady ? "real" : "insufficient";
    const store = realStore;
    // Dữ liệu chỉ đổi khi nạp (dataVersion đổi) -> TTL dài; tính lại chỉ khi đổi dữ liệu hoặc ngày asOf.
    const raw = createMacroApi({ store, today, cacheTtlMs: 12 * 3600_000, maxCacheEntries: 400, notice: undefined });
    const api = { ...raw, handle: async (req) => referenceOnly(await raw.handle(req), mode) };
    state = { mode, api, tools: createMacroChatTools(api), coverage, realCount: real.length, quarantined: gate.held };
  }
  rebuild();

  return {
    setReal(list) {
      real = Array.isArray(list) ? list : [];
      rebuild();
      return this.source();
    },
    source() {
      return {
        mode: state.mode,
        notice: null,
        reason: state.mode === "real" ? null : `Chưa đủ dữ liệu thực tế để tính mô hình vĩ mô: cần ≥ 1 biến vĩ mô và ≥ 1 chỉ số có tối thiểu ${MIN_MONTHS} tháng còn cập nhật. Không kích hoạt mô phỏng.`,
        realObservations: state.realCount,
        minMonths: MIN_MONTHS,
        ...state.coverage,
        quarantined: state.quarantined,
      };
    },
    handle(req) {
      return state.api.handle(req);
    },
    runTool(name, args) {
      return state.tools.run(name, args);
    },
    toolSpecs() {
      return { specs: MACRO_TOOL_SPECS, anthropic: toAnthropicTools(), systemPrompt: MACRO_CHAT_SYSTEM_PROMPT, mode: state.mode, notice: null };
    },
  };
}

/** Phân tích CSV một chuỗi (không ghi gì) -> quan sát + báo cáo chất lượng, để route admin xem trước/ghi. */
export function parseSeriesCsv({ seriesId, csv, locale, delimiter, hasHeader, monthly, asOf, today }) {
  const meta = BY_ID[seriesId];
  if (!meta) throw Object.assign(new Error(`Mã chuỗi không hợp lệ: ${seriesId}. Hợp lệ: ${VN_CATALOG.map((m) => m.id).join(", ")}.`), { statusCode: 400 });
  if (typeof csv !== "string" || !csv.trim()) throw Object.assign(new Error("Thiếu nội dung CSV."), { statusCode: 400 });
  if (asOf !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw Object.assign(new Error("asOf phải có dạng YYYY-MM-DD."), { statusCode: 400 });
  const { observations, rejectedRows } = importSeriesCsv({ csv, meta, locale, delimiter, hasHeader, monthly, asOfOverride: asOf });
  const issues = checkQuality(seriesId, observations.map((o) => ({ period: o.period, value: o.value })), meta, (today ?? new Date().toISOString()).slice(0, 7));
  return { meta, observations, rejectedRows, issues, hasErrors: issues.some((i) => i.severity === "error") };
}

export { VN_CATALOG, SYNTHETIC_NOTICE };
