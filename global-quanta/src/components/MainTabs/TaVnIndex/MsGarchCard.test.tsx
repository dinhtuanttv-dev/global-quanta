import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "../../../test/rtl-lite";
import MsGarchCard from "./MsGarchCard";
import type { MsGarchDoc } from "../../../hooks/useMsGarchBands";

const band = (day: number, q: number) => ({ day, p10: 1 - q, p50: 1, p90: 1 + q });
const doc: MsGarchDoc = {
  symbol: "FPT", available: true, asOf: "2026-10-30", regime: { label: "volatile", probCalm: 0.2, probVolatile: 0.8 }, volAnnualPct: 31.4, converged: true, warnings: ["Tham số gần ngưỡng ổn định."],
  bands: [band(5, 0.05), band(10, 0.08), band(20, 0.12)], baseline: [band(5, 0.04), band(10, 0.06), band(20, 0.09)],
};
const base = { on: true, onEnable: () => {}, doc, loading: false, dailyOnly: false, close: 50000, validation: "Chưa đạt kiểm định." };
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
afterEach(cleanup);

describe("Thẻ MS-GARCH", () => {
  it("hiện trạng thái, xác suất, giá theo giá trên chart và so với mô hình đơn giản", () => {
    render(<MsGarchCard {...base} />);
    expect(q("msgarch-regime")?.textContent).toContain("Biến động");
    expect(q("msgarch-regime")?.textContent).toContain("80%");
    expect(q("msgarch-row-20")?.textContent).toContain("44.000");
    expect(q("msgarch-row-20")?.textContent).toContain("56.000");
    expect(q("msgarch-row-20")?.textContent).toContain("−9,0%");
    expect(q("msgarch-warnings")?.textContent).toContain("ngưỡng");
    expect(q("msgarch-validation")?.textContent).toContain("không dự báo chiều giá");
  });

  it("chưa bật thì có nút bật; không gọi là tín hiệu mua bán", () => {
    const onEnable = vi.fn();
    render(<MsGarchCard {...base} on={false} onEnable={onEnable} />);
    (q("msgarch-enable") as HTMLButtonElement).click();
    expect(onEnable).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toMatch(/\bMUA\b|\bBÁN\b/);
  });

  it("nói rõ khi không áp dụng hoặc thiếu dữ liệu", () => {
    render(<MsGarchCard {...base} dailyOnly />);
    expect(q("msgarch-daily-only")).toBeTruthy();
    cleanup();
    render(<MsGarchCard {...base} doc={{ symbol: "NEW", available: false, reason: "Cần ít nhất 260 phiên." }} />);
    expect(q("msgarch-unavailable")?.textContent).toContain("260");
    cleanup();
    render(<MsGarchCard {...base} doc={null} error={new Error("HTTP 429")} />);
    expect(document.querySelector("[role=alert]")?.textContent).toContain("429");
  });
});
