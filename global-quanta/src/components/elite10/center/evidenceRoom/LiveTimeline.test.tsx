// 27/11/2026 — Timeline đồng bộ v2: ba mức setup cùng cơ sở giá, phiên kích hoạt chưa đủ điều kiện, giá làm tròn, khung khối lượng tách riêng.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "../../../../test/rtl-lite";
import { LiveTimeline, pxVi, triggerInfo } from "./LiveTimeline";
import type { PriceActionEvidence, TimelinePriceEvidence } from "../../../../lib/evidenceBrain/snapshot";

afterEach(() => cleanup());
const days = Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 10).padStart(2, "0")}`);
const price = { priceBasis: "ADJUSTED_CUMULATIVE", bars: days.map((date, i) => ({ date, close: 47000 + i * 300 })) } as unknown as TimelinePriceEvidence;
const volume = { partialToday: false, today: { date: days[11] }, trend: { bars30: days.map((date, i) => ({ date, close: 47000 + i * 300, volume: 100000 + (i % 3) * 50000 })) } } as never;
const pa = (over: Record<string, unknown> = {}) => ({ priceBasis: "ADJUSTED_CUMULATIVE", state: "INSUFFICIENT", barClosed: true, confirmed: false,
  setup: { kind: "REVERSAL_AT_SUPPORT", stateDate: days[9], entryReference: 49650, invalidationLevel: 47826.57, target: 51000, state: "triggered", rewardRisk: 0.8 }, ...over }) as unknown as PriceActionEvidence;

describe("Timeline đồng bộ v2", () => {
  it("giá làm tròn theo đồng; vẽ đủ kích hoạt / vô hiệu / mục tiêu; phiên kích hoạt chưa đủ điều kiện có nhãn riêng", () => {
    expect(pxVi(47826.57)).toBe("47.827");
    const { container } = render(<LiveTimeline price={price} volume={volume} events={[]} pa={pa()} onEvent={() => {}} onPriceAction={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Vô hiệu 47.827");
    expect(text).toContain("Kích hoạt 49.650");
    expect(text).toContain("Mục tiêu 51.000");
    expect(text).toContain("PA kích hoạt · chưa đủ ĐK");
    expect(text).toContain("đã kích hoạt, chưa đủ điều kiện");
    expect(container.querySelectorAll(".eb-vol-up, .eb-vol-down, .eb-vol-flat, .eb-vol-trigger-pending").length).toBe(12);
    expect(container.querySelector(".eb-vol-avg")).not.toBeNull();
  });
  it("xác nhận = xanh; khác cơ sở giá -> không vẽ mức, chip báo cần đối chiếu (giữ hành vi cũ)", () => {
    expect(triggerInfo(pa({ state: "TRIGGERED", confirmed: true }), true)).toEqual({ day: days[9], confirmed: true });
    expect(triggerInfo(pa(), false)).toEqual({ day: null, confirmed: false });
    const { container } = render(<LiveTimeline price={price} volume={volume} events={[]} pa={pa({ priceBasis: "NOMINAL" })} onEvent={() => {}} onPriceAction={() => {}} />);
    expect(container.querySelector(".invalidation-line")).toBeNull();
    expect(container.textContent).toContain("cần đối chiếu nến và cơ sở giá");
    expect(container.textContent).toContain("chưa đối chiếu cơ sở giá");
  });
  it("rê vào phiên hiện thẻ chi tiết (giá, % so phiên trước, × trung bình khối lượng); bấm phiên kích hoạt mở Price Action", () => {
    const onPA = vi.fn();
    const { container } = render(<LiveTimeline price={price} volume={volume} events={[]} pa={pa()} onEvent={() => {}} onPriceAction={onPA} />);
    const pts = container.querySelectorAll(".eb-chart-point");
    act(() => { (pts[9] as unknown as HTMLElement).focus(); });
    const tip = container.querySelector(".eb-chart-tip")?.textContent ?? "";
    expect(tip).toContain("19/11/2026");
    expect(tip).toContain("Giá 49.700 (+0,61%)");
    expect(tip).toMatch(/KL 100 k · [0-9,]+× TB/);
    expect(tip).toContain("PA kích hoạt · chưa đủ điều kiện");
    fireEvent.click(pts[9]);
    expect(onPA).toHaveBeenCalled();
  });
});
