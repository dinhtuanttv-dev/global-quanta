import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { cleanup, render, screen } from "../../../test/rtl-lite";

const urls: string[] = [];
let doc: unknown;
vi.mock("../../../services/marketDataClient", async (orig) => ({
  ...(await orig<typeof import("../../../services/marketDataClient")>()),
  fetchMarketJson: async (url: string) => { urls.push(url); return doc; },
}));
import AiBrainCard from "./AiBrainCard";

const horizon = (n: number, hit: number | null) => ({ n, baseline: 0.004, positive: { n: Math.round(n / 2), meanExcess: 0.012 }, negative: { n: 3, meanExcess: -0.006 },
  directional: n, hitRate: hit, hitCi90: hit == null ? null : [hit - 0.1, hit + 0.1], valueAdd: 0.008 });
const make = (label: string, n10: number, hit: number | null, entries: unknown[] = []) => ({
  version: "ARL-v1", updatedAt: null, entries,
  summary: { version: "ARL-v1", total: n10 + 4, ready: n10, withBalance: n10, horizons: { 5: horizon(n10, hit), 10: horizon(n10, hit), 20: horizon(n10, hit) },
    label, labelVi: label === "THĂM DÒ" ? "THĂM DÒ — chưa có kiểm định đăng ký trước." : `CHƯA ĐỦ MẪU — cần ≥ 30 bản (hiện ${n10}).`, methodVi: "Cán cân = …" },
});
const mount = async (ui: JSX.Element) => { render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>); await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); };
afterEach(() => { cleanup(); urls.length = 0; });

describe("Bộ não Phòng họp AI — sổ phán quyết", () => {
  it("chưa đủ mẫu: ghi rõ, KHÔNG hiện tỷ lệ đúng chiều như kết luận", async () => {
    doc = make("CHƯA ĐỦ MẪU", 7, 0.71);
    await mount(<AiBrainCard testId="b" />);
    expect(screen.getByTestId("b").textContent).toContain("CHƯA ĐỦ MẪU");
    expect(screen.getByTestId("b-headline").textContent).not.toContain("Cán cân đúng chiều");
    expect(urls).toEqual(["/api/elite/ai-room/ledger"]);
  });
  it("đủ mẫu: hiện tỷ lệ kèm KTC 90% và bảng theo kỳ hạn có đường cơ sở + giá trị thêm", async () => {
    doc = make("THĂM DÒ", 42, 0.6);
    await mount(<AiBrainCard testId="b" />);
    const t = screen.getByTestId("b").textContent ?? "";
    expect(screen.getByTestId("b-headline").textContent).toContain("Cán cân đúng chiều 60% (KTC 90% 50%–70%, 42 lần)");
    expect(t).toContain("Đường cơ sở (mọi mã lõi)"); expect(t).toContain("AI thêm giá trị"); expect(t).toContain("+0,8%");
  });
  it("theo mã (Hồ sơ 360° / khối trái): gọi sổ đúng mã, chế độ gọn, hiện kết quả từng kỳ hạn hoặc 'chờ'", async () => {
    doc = make("CHƯA ĐỦ MẪU", 1, null, [{ id: "HPG|2026-11-20", ticker: "HPG", session: "2026-11-20", state: "READY", membership: "PORTFOLIO_CORE", hlRank: 3,
      sides: { BULL: null, BEAR: null, JUDGE: null }, balance: 2, results: { 5: { entry: "2026-11-23", exit: "2026-11-30", ret: 0.03, vnRet: 0.01, excess: 0.02 } } }]);
    await mount(<AiBrainCard ticker="HPG" compact testId="b" />);
    expect(urls).toEqual(["/api/elite/ai-room/ledger?ticker=HPG"]);
    const t = screen.getByTestId("b").textContent ?? "";
    expect(t).toContain("+2 nghiêng thuận"); expect(t).toContain("+2,0%"); expect(t).toContain("chờ");
    expect(t).not.toContain("Đường cơ sở"); // chế độ gọn không có bảng tổng hợp
  });
  it("chỉ số (VNINDEX ở Hồ sơ 360°): không gọi sổ, không hiện bản ghi của mã khác", async () => {
    doc = make("CHƯA ĐỦ MẪU", 1, null, [{ id: "NAF|2026-11-26", ticker: "NAF", session: "2026-11-26", state: "PARTIAL", membership: null, hlRank: null, sides: { BULL: null, BEAR: null, JUDGE: null }, balance: null, results: {} }]);
    await mount(<AiBrainCard ticker="VNINDEX" compact testId="b" />);
    expect(urls).toEqual([]);
    const tx = screen.getByTestId("b").textContent ?? "";
    expect(tx).toContain("VNINDEX là chỉ số"); expect(tx).not.toContain("NAF");
  });
  it("sổ trống: giải thích khi nào bắt đầu có dữ liệu", async () => {
    doc = make("CHƯA ĐỦ MẪU", 0, null);
    await mount(<AiBrainCard ticker="FPT" compact testId="b" />);
    expect(screen.getByTestId("b").textContent).toContain("Chưa có bản phân tích nào của FPT");
  });
});
