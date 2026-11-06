import { describe, expect, it } from "vitest";
import { trailingCashDividend, trailingYieldPct, yieldAnomaly } from "./universe-stocks";
import type { DividendLifecycleEvent } from "../../hooks/useDividendEvents";

const ev = (exrightDate: string, valuePerShare: number, eventTitleVi: string, eventType: DividendLifecycleEvent["eventType"] = "CASH"): DividendLifecycleEvent => ({
  ticker: "X", eventType, eventTitleVi, publicDate: null, agmDate: null, exrightDate, recordDate: null, settlementDate: null, valuePerShare, exerciseRatio: null,
});

describe("F3 — cảnh báo tỷ suất cổ tức bất thường (chỉ cảnh báo)", () => {
  it("DGC thật 06/11/2026: 3 đợt gộp 2 năm tài chính, tỷ suất 32,9% -> cảnh báo kèm lý do; số tỷ suất KHÔNG đổi", () => {
    const today = "2026-11-06";
    const events = [
      ev("2026-09-14", 5000, "Trả cổ tức đợt 2/2025 (5000 đ/cp)"), ev("2026-09-14", 3000, "Trả cổ tức đợt 1/2026 (3000 đ/cp)"),
      ev("2025-12-24", 3000, "Trả cổ tức đợt 1/2025 (3000 đ/cp)"), ev("2024-11-19", 3000, "Trả cổ tức năm 2024 (3000 đ/cp)"),
      ev("2023-12-19", 3000, "Trả cổ tức năm 2023 (3000 đ/cp)"), ev("2022-12-20", 3000, "Trả cổ tức năm 2022 (3000 đ/cp)"),
    ];
    const y = trailingYieldPct(trailingCashDividend(events, today), 33450)!;
    expect(y).toBe(32.9);
    const a = yieldAnomaly(events, y, today)!;
    expect(a.payments).toBe(3);
    expect(a.fiscalYears).toEqual([2025, 2026]);
    expect(a.reasons.join(" | ")).toContain("≥ 15%");
    expect(a.reasons.join(" | ")).toContain("gộp cổ tức của 2 năm tài chính (2025, 2026)");
    expect(a.reasons.join(" | ")).toContain("≥ 2 lần trung vị");
  });
  it("trả đều mỗi năm một đợt, tỷ suất bình thường -> không cảnh báo", () => {
    const today = "2026-11-06";
    const events = [ev("2026-06-10", 2000, "Trả cổ tức năm 2025 (2000 đ/cp)"), ev("2025-06-10", 2000, "Trả cổ tức năm 2024"), ev("2024-06-10", 2000, "Trả cổ tức năm 2023")];
    expect(yieldAnomaly(events, 6.5, today)).toBeNull();
  });
  it("chia cổ phiếu sau đợt tiền mặt trong cửa sổ -> cảnh báo cổ tức cũ tính trên số CP trước chia", () => {
    const today = "2026-11-06";
    const events = [ev("2026-01-10", 2000, "Trả cổ tức năm 2025"), ev("2026-05-10", 0, "Thưởng cổ phiếu 1:1", "BONUS_ISSUE")];
    events[1].valuePerShare = null;
    const a = yieldAnomaly(events, 8, today)!;
    expect(a.reasons.join(" | ")).toContain("chia cổ phiếu");
  });
  it("thiếu dữ liệu -> null", () => {
    expect(yieldAnomaly(undefined, 20, "2026-11-06")).toBeNull();
    expect(yieldAnomaly([ev("2026-01-01", 1000, "x")], null, "2026-11-06")).toBeNull();
  });
});
