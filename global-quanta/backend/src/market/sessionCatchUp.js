// Bù phiên (14/11/2026) — sự cố 13/11/2026: chuỗi job cuối ngày không chạy (hàng đợi job bị một job treo chặn), Siêu Quét kẹt ở phiên
// 12/11 và bảng Elite không dựng được phiên 13/11. Lịch cũ chỉ chạy job "ngày giao dịch" ĐÚNG ngày đó, nên một phiên đã lỡ thì không bao
// giờ được dựng lại. Job này chạy cả ngày nghỉ: khi dữ liệu ngày (market_daily) đã có phiên mới hơn kết quả Siêu Quét, nó chạy lại chuỗi
// dựng của phiên đó theo đúng thứ tự lịch. Các job trong chuỗi đều lấy NGÀY từ dữ liệu (không từ đồng hồ) nên chạy bù không ghi sai phiên.
import { vnDate, vnParts } from "./calendar.js";

export const CATCH_UP_CHAIN = ["scanUniverse", "scanStrategies", "scanStructure", "buildSectorRotation", "buildTop20Inputs"];
const SCAN_AT_MIN = 15 * 60 + 40; // giờ chạy Siêu Quét theo lịch

/**
 * @param deps.jobs   bảng job của runtime (gọi trực tiếp — job này đã chạy trong hàng đợi, gọi qua scheduler sẽ tự khoá)
 * @param deps.store  getMarketDailyDates, getKv
 */
export function createSessionCatchUp({ jobs, store, now = Date.now, log = console, chain = CATCH_UP_CHAIN }) {
  return async function sessionCatchUp() {
    const latestDaily = (await store.getMarketDailyDates()).at(-1) ?? null;
    const scanAsOf = (await store.getKv("scanner:latest"))?.value?.dataAsOf ?? null;
    if (!latestDaily) return { skipped: "Chưa có dữ liệu ngày" };
    if (scanAsOf && scanAsOf >= latestDaily) return { skipped: "Siêu Quét đã cập nhật", session: latestDaily, scanAsOf };
    const d = new Date(now());
    // Phiên hôm nay chưa tới giờ quét theo lịch -> để lịch thường chạy, không chạy sớm.
    if (latestDaily === vnDate(d) && vnParts(d).minutes < SCAN_AT_MIN) return { skipped: "Chưa tới giờ quét của phiên hôm nay", session: latestDaily, scanAsOf };
    const done = [];
    for (const name of chain) {
      if (typeof jobs[name] !== "function") continue;
      try { await jobs[name](); done.push({ name, ok: true }); }
      catch (e) { done.push({ name, ok: false, error: String(e?.message ?? e).slice(0, 160) }); }
    }
    log.info?.(`[market] Bù phiên ${latestDaily} (Siêu Quét đang ở ${scanAsOf ?? "—"}): ${done.map((x) => (x.ok ? x.name : `${x.name} LỖI`)).join(", ")}`);
    return { session: latestDaily, scanAsOfBefore: scanAsOf, done };
  };
}
