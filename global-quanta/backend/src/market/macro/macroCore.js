// Lõi Trung tâm vĩ mô (chạy trong worker thread của Gateway, hoặc trực tiếp trong test).
// Nguyên tắc dữ liệu: KHÔNG BAO GIỜ trộn số liệu thật với số liệu mô phỏng.
//   - Chế độ "real": chỉ khi kho số liệu THẬT (nạp CSV qua route admin + chuỗi chỉ số HOSE lấy từ Gateway) có >= 1 biến vĩ mô
//     VÀ >= 1 chỉ số với tối thiểu 60 tháng. Engine chỉ thấy kho thật, không có biểu ngữ mô phỏng.
//   - Ngược lại: chế độ "synthetic" — kho mô phỏng tất định (seed 2024), MỌI phản hồi mang SYNTHETIC_NOTICE.
import {
  createMacroApi, createMacroChatTools, makeSyntheticStore, InMemoryVintageStore, VN_CATALOG, SYNTHETIC_NOTICE,
  importSeriesCsv, checkQuality, catalogById, MACRO_TOOL_SPECS, MACRO_CHAT_SYSTEM_PROMPT, toAnthropicTools,
} from "./vendor/macroEngine.mjs";

export const MIN_MONTHS = 60;
const BY_ID = catalogById(VN_CATALOG);
const obsKey = (o) => `${o.seriesId}|${o.period}|${o.asOf}`;

/** Gộp quan sát mới vào danh sách cũ theo (seriesId, period, asOf) — chỉ-thêm: bản sửa mới là một vintage mới. */
export function mergeObservations(existing, incoming) {
  const map = new Map(existing.map((o) => [obsKey(o), o]));
  let added = 0;
  let changed = 0;
  for (const o of incoming) {
    const k = obsKey(o);
    const prev = map.get(k);
    if (!prev) added++;
    else if (prev.value !== o.value) changed++;
    else continue;
    map.set(k, { seriesId: o.seriesId, period: o.period, value: o.value, asOf: o.asOf, ...(o.source ? { source: o.source } : {}) });
  }
  const list = [...map.values()].sort((a, b) => (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : a.period < b.period ? -1 : a.period > b.period ? 1 : a.asOf < b.asOf ? -1 : 1));
  return { list, added, changed };
}

/** Độ phủ của kho số liệu thật: số tháng mỗi chuỗi, và có đủ để bật chế độ "real" không. */
export function coverageOf(store) {
  const series = VN_CATALOG.map((m) => {
    const pts = store.getSeries(m.id);
    return { id: m.id, nameVi: m.nameVi, role: m.role, n: pts.length, first: pts[0]?.period ?? null, last: pts.at(-1)?.period ?? null };
  });
  const ok = (role) => series.filter((s) => s.role === role && s.n >= MIN_MONTHS).map((s) => s.id);
  const factors = ok("factor");
  const targets = ok("target");
  return { series, usableFactors: factors, usableTargets: targets, realReady: factors.length > 0 && targets.length > 0 };
}

export function createMacroCore({ today } = {}) {
  let real = [];
  let state = null;

  function rebuild() {
    const realStore = new InMemoryVintageStore();
    if (real.length) realStore.upsert(real);
    const coverage = coverageOf(realStore);
    const mode = coverage.realReady ? "real" : "synthetic";
    const store = mode === "real" ? realStore : makeSyntheticStore();
    // Dữ liệu chỉ đổi khi nạp (dataVersion đổi) -> TTL dài; tính lại chỉ khi đổi dữ liệu hoặc ngày asOf.
    const api = createMacroApi({ store, today, cacheTtlMs: 12 * 3600_000, maxCacheEntries: 400, notice: mode === "synthetic" ? SYNTHETIC_NOTICE : undefined });
    state = { mode, api, tools: createMacroChatTools(api), coverage, realCount: real.length };
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
        notice: state.mode === "synthetic" ? SYNTHETIC_NOTICE : null,
        realObservations: state.realCount,
        minMonths: MIN_MONTHS,
        ...state.coverage,
      };
    },
    handle(req) {
      return state.api.handle(req);
    },
    runTool(name, args) {
      return state.tools.run(name, args);
    },
    toolSpecs() {
      return { specs: MACRO_TOOL_SPECS, anthropic: toAnthropicTools(), systemPrompt: MACRO_CHAT_SYSTEM_PROMPT, mode: state.mode, notice: state.mode === "synthetic" ? SYNTHETIC_NOTICE : null };
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
