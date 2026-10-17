// Chiến lược ngành (S3): ngắn hạn α có nhãn bằng chứng + lợi thế nhỏ, trung hạn chỉ bối cảnh, sổ bằng chứng đủ kiểm định (fixture live 2026-10-17).
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import strategy from "./__fixtures__/strategy.json";
import scores from "../worldSectors/__fixtures__/scores.json";
import StrategyPanel from "./StrategyPanel";
import EvidenceLedgerPanel, { PREREG_TESTS } from "./EvidenceLedgerPanel";

vi.mock("../../../../services/marketDataClient", () => ({
  fetchMarketJson: vi.fn(async (path: string) => (path.includes("/strategy") ? strategy : scores)),
}));
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const wrap = (ui: React.ReactElement) => render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
afterEach(cleanup);

describe("StrategyPanel", () => {
  it("ngắn hạn: đủ ngành, xếp theo α, nhãn tư thế; trung hạn: 3 nhóm bối cảnh, ghi rõ không dự báo", async () => {
    wrap(<StrategyPanel />);
    await flush();
    const t = screen.getByTestId("strategy-panel").textContent ?? "";
    expect(t).toContain("lợi thế rất nhỏ");
    expect(t).toContain("Ưu tiên");
    expect(t).toContain("Giảm tỷ trọng");
    expect(t).toContain("Bối cảnh thuận");
    expect(t).toContain("KHÔNG dự báo");
    expect(screen.getByTestId("strategy-short").querySelectorAll("tbody tr").length).toBe(strategy.short.rows.length);
    const alphas = strategy.short.rows.map((r: { alphaBps: number | null }) => r.alphaBps ?? -1e9);
    expect([...alphas].sort((a, b) => b - a)).toEqual(alphas);
  });
});

describe("EvidenceLedgerPanel", () => {
  it("liệt kê mọi kiểm định đặt trước với kết quả trung thực + theo dõi tiến", async () => {
    wrap(<EvidenceLedgerPanel />);
    await flush();
    const t = screen.getByTestId("evidence-ledger").textContent ?? "";
    for (const id of ["WS-H3", "WS-H4", "W3", "RON", "L3"]) expect(t).toContain(id);
    expect(t).toContain("KHÔNG ĐẠT");
    expect(t).toContain("Đang tích luỹ mẫu");
    expect(PREREG_TESTS.filter((x) => x.verdict === "pass").map((x) => x.id)).toEqual(["WS-H3"]);
  });
});
