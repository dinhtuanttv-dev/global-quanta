// S8-2 (06/11/2026) — chạy TRONG worker_thread (qmsJobs.runInWorker): Mùa vụ KQKD bản THĂM DÒ "ngày làm mốc = ngày công bố thật".
// Dùng ĐÚNG các hàm của job Mùa vụ Project A (vendor/seasonCore.mjs, đóng gói từ mã nguồn QMS — không sao chép thuật toán):
// giá SSI tổng lợi suất 10 năm (loadStockPrices / loadBenchmarkPrices), ngày công bố VNDirect (fetchAnnounceDates), mẫu CAR quanh ngày
// công bố (buildSeasonalitySamples), prior ngành + thống kê cả năm + lịch (finalizeTicker). Khác bản chính DUY NHẤT ở ngày làm mốc:
// kỳ nào có ngày CafeF (cafefAnnounce) thì dùng ngày đó, không có thì giữ ngày VNDirect như bản chính.
import { buildSeasonalitySamples, fetchAnnounceDates, finalizeTicker, loadBenchmarkPrices, loadStockPrices, QUARTERS } from "../vendor/seasonCore.mjs";
import { fiscalForEvent } from "./seasonalityBundle.js";

const YEARS = 10; // = SEASONALITY_YEARS của job Mùa vụ (lib/jobs/earnings-seasonality-scan.ts)

/** Ngày làm mốc: thay ngày VNDirect bằng ngày CafeF theo (quý tài chính); thêm kỳ chỉ CafeF có. overrides: { fiscal: date }. */
export function mergeAnnounce(vnd, overrides) {
  const announce = {}, sources = { cafef: 0, vnd: 0, added: 0 };
  for (const q of QUARTERS) {
    const byFiscal = new Map();
    for (const d of vnd[String(q)] ?? []) byFiscal.set(fiscalForEvent(d, q), { date: d, src: "vnd" });
    for (const [fiscal, date] of Object.entries(overrides ?? {})) {
      if (Number(fiscal.slice(5, 7)) !== q * 3) continue;
      if (!byFiscal.has(fiscal)) sources.added += 1;
      byFiscal.set(fiscal, { date, src: "cafef" });
    }
    for (const v of byFiscal.values()) sources[v.src] += 1;
    announce[String(q)] = [...new Set([...byFiscal.values()].map((v) => v.date))].sort();
  }
  return { announce, sources };
}

export async function collectX({ tickers, overrides = {}, asOf }) {
  const bench = await loadBenchmarkPrices(YEARS);
  if (!bench.ok) return { status: 502, body: { error: `VN-Index: ${bench.error}` } };
  const rows = [];
  for (const t of tickers) {
    try {
      const [prices, ann] = await Promise.all([loadStockPrices(t, YEARS), fetchAnnounceDates(t)]);
      if (!prices.ok) { rows.push({ ticker: t, ok: false, error: `giá: ${prices.error}` }); continue; }
      if (!ann.ok) { rows.push({ ticker: t, ok: false, error: `ngày công bố: ${ann.error}` }); continue; }
      const { announce, sources } = mergeAnnounce(ann.announce, overrides[t]);
      const built = buildSeasonalitySamples(t, prices.prices, bench.prices, announce, asOf);
      rows.push({ ticker: t, ok: true, samples: built.samples, paths: built.paths, announce, sources, priceSource: prices.source, skipped: built.skipped });
    } catch (e) { rows.push({ ticker: t, ok: false, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  return { status: 200, body: { rows } };
}

/** collected: [{ ticker, sector, samples, announce }] — prior ngành tính trên CHÍNH bản THĂM DÒ (nhất quán như bản chính). */
export async function finalizeX({ collected, asOf }) {
  const rows = {};
  for (const t of collected) { const { stats, calendar, priorScope } = finalizeTicker(t, collected, asOf); rows[t.ticker] = { stats, calendar, priorScope }; }
  return { status: 200, body: { rows } };
}
