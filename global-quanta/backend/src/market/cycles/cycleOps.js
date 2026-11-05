// Các phép tính trên ngữ cảnh thư viện Cycle, dùng chung cho worker và cho chế độ chạy trong tiến trình chính (dự phòng).
// Hàm thuần theo ngữ cảnh: cùng ngữ cảnh -> cùng kết quả ở cả hai nơi.
import { prepareExternal, queryCycles } from "./cycleService.js";
import { scoreLedger, snapshotRow } from "./ledger.js";

export const cycleOps = {
  info(ctx) {
    return { builtAt: ctx.builtAt, dataAsOf: ctx.dataAsOf, calDates: ctx.cal.dates, windows: ctx.lib.N, tickers: ctx.lib.tickers.length, skipped: ctx.skipped ?? null, viaTaSeries: ctx.viaTaSeries ?? null };
  },
  /** Truy vấn một mã; `external` = chuỗi /ta-series của mã ngoài thư viện (không thêm vào thư viện). */
  query(ctx, { symbol, external = null }) {
    if (!external) return queryCycles(ctx, symbol);
    const ext = prepareExternal(ctx, symbol, external.bars ?? [], ctx.sectorOf?.get(symbol) ?? null);
    const r = ext ? queryCycles(ctx, symbol, ext) : null;
    return r ? { ...r, inLibrary: false } : null;
  },
  /** Bản chụp sổ theo dõi cho mọi mã trong thư viện. */
  snapshotRows(ctx) {
    const rows = [];
    for (const t of ctx.lib.tickers) { const q = queryCycles(ctx, t); if (q) rows.push(snapshotRow(t, q)); }
    return rows;
  },
  score(ctx, { docs, symbol = null }) {
    return scoreLedger(ctx, docs, { symbol });
  },
};
