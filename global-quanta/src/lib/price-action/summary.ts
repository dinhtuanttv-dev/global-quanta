// pa-book-2 (26/11/2026) — một nguồn duy nhất cho "xác nhận kỹ thuật" Price Action (Hồ sơ 360° và Phòng họp AI dùng chung).
import type { PASetup, PatternId, PriceActionResult, SetupKind } from "./types.ts";

export const PATTERN_VI: Record<PatternId, string> = {
  TREND_BAR: "Nến xu hướng", REVERSAL_BAR: "Nến đảo chiều", KEY_REVERSAL_BAR: "Đảo chiều chủ chốt", EXHAUSTION_CANDIDATE: "Nến đuối sức",
  PIN_BAR: "Pin bar", TWO_BAR_REVERSAL: "Đảo chiều 2 thanh", THREE_BAR_REVERSAL: "Đảo chiều 3 thanh", THREE_BAR_PULLBACK: "3 nến hồi",
  INSIDE_BAR: "Inside bar", OUTSIDE_BAR: "Outside bar", NR7: "NR7",
};
export const SETUP_VI: Record<SetupKind, string> = {
  REVERSAL_AT_SUPPORT: "Đảo chiều tại hỗ trợ", REVERSAL_AT_RESISTANCE: "Đảo chiều tại kháng cự", CONTINUATION_IN_TREND: "Tiếp diễn theo xu hướng",
};
/** Số phiên một setup đã kích hoạt còn được trình bày là "vừa kích hoạt". */
export const RECENT_TRIGGER_BARS = 5;

export interface PaBuySummary {
  latestDate: string | null;
  /** Kích hoạt đúng phiên cuối. */
  triggeredToday: PASetup | null;
  /** Kích hoạt trong RECENT_TRIGGER_BARS phiên gần nhất (gồm hôm nay). */
  recent: PASetup | null;
  pending: PASetup | null;
  setup: PASetup | null;
  /**
   * Xác nhận kỹ thuật (theo sách): setup mua kích hoạt ở phiên cuối, cấu trúc KHÔNG giảm (đảo chiều tại hỗ trợ dùng được khi xu hướng hỗn hợp),
   * cổng lời/lỗ ≥ 1,5 không bị trượt. Khối lượng báo riêng (volumeConfirmed) — đóng góp của nó do PA-VOL-r1 kiểm định.
   */
  confirmed: boolean;
  volumeConfirmed: boolean | null;
}

export function summarizeBuy(result: PriceActionResult | null): PaBuySummary {
  const empty: PaBuySummary = { latestDate: null, triggeredToday: null, recent: null, pending: null, setup: null, confirmed: false, volumeConfirmed: null };
  if (!result) return empty;
  const latestDate = result.trend.asOfDate;
  const last = result.trend.asOfIndex;
  const buys = result.setups.filter((s) => s.direction === "bullish");
  const triggeredToday = buys.find((s) => s.state === "triggered" && s.stateIndex === last) ?? null;
  const recent = buys.filter((s) => s.state === "triggered" && last - s.stateIndex < RECENT_TRIGGER_BARS).sort((a, b) => b.stateIndex - a.stateIndex)[0] ?? null;
  const pending = buys.filter((s) => s.state === "forming").sort((a, b) => b.confirmedIndex - a.confirmedIndex)[0] ?? null;
  const setup = triggeredToday ?? pending ?? recent;
  const confirmed = Boolean(result.status === "ready" && triggeredToday && result.trend.state !== "bearish" && triggeredToday.rewardRiskOk !== false);
  return { latestDate, triggeredToday, recent, pending, setup, confirmed, volumeConfirmed: setup?.volume.confirmed ?? null };
}
