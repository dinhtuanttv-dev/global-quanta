// Ngành thế giới → ngành VN (M4): xếp hạng thuận/ngược gió, nhãn kiểm định đặt trước, bản đồ nhiệt, mở bảng phụ (fixture live 2026-10-17).
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import scores from "./__fixtures__/scores.json";
import detail from "./__fixtures__/detail-0500.json";
import WorldSectorPanel from "./WorldSectorPanel";
import { divergingColor } from "../../../../lib/worldSectors/types";

vi.mock("../../../../services/marketDataClient", () => ({
  fetchMarketJson: vi.fn(async (path: string) => (path.includes("/detail") ? detail : scores)),
}));
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const mount = () => render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><WorldSectorPanel /></SWRConfig>);
afterEach(cleanup);

describe("WorldSectorPanel", () => {
  it("nhãn bằng chứng, bản đồ nhiệt 22 ngành, đổi sang trung hạn = thăm dò", async () => {
    mount();
    await flush();
    const t = screen.getByTestId("world-sector-panel").textContent ?? "";
    expect(t).toContain("BẰNG CHỨNG");
    expect(screen.getByTestId("ws-heatmap").querySelectorAll("tbody tr").length).toBe(scores.rows.filter((r: { available: boolean }) => r.available).length);
    const mid = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").startsWith("Trung hạn"))!;
    fireEvent.click(mid);
    await flush();
    expect(screen.getByTestId("world-sector-panel").textContent).toContain("THĂM DÒ");
  });

  it("bấm một ngành mở bảng phụ: điểm phân rã, biểu đồ, quan hệ, cổ phiếu thành phần", async () => {
    mount();
    await flush();
    fireEvent.click(document.querySelector('[data-testid="ws-heatmap"] tbody tr')!);
    await flush();
    const d = screen.getByTestId("ws-drawer").textContent ?? "";
    expect(d).toContain("phân rã");
    expect(d).toContain("Quan hệ với từng mã nước ngoài");
    expect(d).toContain("Cổ phiếu thành phần");
    expect(screen.getByTestId("ws-chart").querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(screen.queryByTestId("ws-drawer")).toBeNull();
  });

  it("màu phân kỳ: dương xanh, âm đỏ, 0 xám, null nền mờ", () => {
    expect(divergingColor(2.5)).toBe("rgb(57,135,229)");
    expect(divergingColor(-2.5)).toBe("rgb(230,103,103)");
    expect(divergingColor(0)).toBe("rgb(56,56,53)");
    expect(divergingColor(null)).toContain("rgba");
  });
});
