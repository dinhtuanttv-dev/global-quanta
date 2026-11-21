import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "../../../test/rtl-lite";

const sw: { data: unknown; error?: Error } = { data: undefined };
vi.mock("swr", () => ({ default: () => ({ data: sw.data, error: sw.error, isLoading: false }) }));
import IntradayPath, { bandStats, toBuckets, tradingMinute, TRADING_MINUTES } from "./IntradayPath";

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
afterEach(() => { cleanup(); sw.data = undefined; sw.error = undefined; });

// Nến 1 phút giả: 09:15 → 14:45, giá đi từ 1.670 lên 1.690, có nghỉ trưa.
const bar = (hh: number, mm: number, close: number) => ({ date: `2026-11-20T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:55+07:00`, open: close - 0.5, high: close + 1, low: close - 1, close });
const day: ReturnType<typeof bar>[] = [];
for (let m = 15; m < 150; m++) { const h = 9 + Math.floor(m / 60); if (h * 60 + (m % 60) > 11 * 60 + 29) break; day.push(bar(h, m % 60, 1670 + m * 0.05)); }
for (let m = 0; m < 105; m++) day.push(bar(13 + Math.floor(m / 60), m % 60, 1680 + m * 0.1));

describe("Đường đi trong phiên — hàm thuần", () => {
  it("phút giao dịch bỏ nghỉ trưa: 09:00=0, 11:30=150, 13:00=150, 15:00=270; ngoài giờ = null", () => {
    expect([tradingMinute("09:00"), tradingMinute("11:30"), tradingMinute("12:10"), tradingMinute("13:00"), tradingMinute("15:00")]).toEqual([0, 150, 150, 150, 270]);
    expect(tradingMinute("08:59")).toBeNull();
    expect(tradingMinute("15:01")).toBeNull();
    expect(TRADING_MINUTES).toBe(270);
  });
  it("gộp nến 5 phút: cao/thấp đúng, đóng = nến cuối, bỏ nến giá 0", () => {
    const bk = toBuckets([bar(9, 15, 100), bar(9, 16, 103), bar(9, 19, 101), { ...bar(9, 20, 0), close: 0 }, bar(9, 21, 99)]);
    expect(bk.length).toBe(2);
    expect(bk[0]).toMatchObject({ t: 15, open: 99.5, high: 104, low: 99, close: 101 });
    expect(bk[1].close).toBe(99);
  });
  it("thống kê dải: % trong dải và lần đầu ra ngoài", () => {
    const bk = toBuckets(day);
    const s = bandStats(bk, 1665, 1685)!;
    expect(s.pctInside).toBeGreaterThan(50);
    expect(s.pctInside).toBeLessThan(100);
    expect(s.firstOut?.side).toBe("trên");
    expect(bandStats([], 1, 2)).toBeNull();
  });
});

describe("Đường đi trong phiên — giao diện", () => {
  it("vẽ đường, dải, nhãn tóm tắt cho trình đọc màn hình; mốc vô hiệu có giờ", () => {
    sw.data = { bars: day };
    render(<IntradayPath date="2026-11-20" live band={{ lo: 1665, hi: 1685 }} prevClose={1689.6} color="#f47a84" title="Trong phiên 20/11" invalidatedAt="2026-11-20T06:20:00Z" />);
    expect(q("mc-path-line")?.getAttribute("d")?.startsWith("M")).toBe(true);
    const svg = q("mc-path")?.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toMatch(/Trong phiên 20\/11: từ 09:15 đến 14:4\d, VN-Index từ 1\.670,3 đến 1\.690,\d; \d+% số nến 5 phút đóng trong dải 1\.665–1\.685, lần đầu ra trên dải lúc/);
    expect(q("mc-path")?.textContent).toContain("vô hiệu 13:20");
    expect(q("mc-path-stats")?.textContent).toContain("thời gian trong dải");
  });
  it("chỉ lấy nến đúng ngày; không có nến thì báo, không vẽ", () => {
    sw.data = { bars: [bar(9, 15, 1)].map((b) => ({ ...b, date: "2026-11-19T09:15:00+07:00" })) };
    render(<IntradayPath date="2026-11-20" live={false} band={{ lo: 1, hi: 2 }} prevClose={null} color="#fff" title="x" />);
    expect(q("mc-path")).toBeNull();
    expect(q("mc-path-empty")?.textContent).toContain("Chưa có giá trong phiên 20/11");
  });
  it("lỗi tải báo rõ", () => {
    sw.error = new Error("HTTP 502");
    render(<IntradayPath date="2026-11-20" live band={{ lo: 1, hi: 2 }} prevClose={null} color="#fff" title="x" />);
    expect(q("mc-path-empty")?.textContent).toContain("HTTP 502");
  });
});
