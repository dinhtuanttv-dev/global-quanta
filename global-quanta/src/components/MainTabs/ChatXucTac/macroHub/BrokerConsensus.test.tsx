import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import type { BrokerDoc } from "./BrokerConsensus";

const cited = (broker: string, quote = "Chúng tôi giữ quan điểm tích cực") => ({ broker, reportId: `${broker}-1`, title: "Báo cáo chiến lược", date: "2026-10-12", url: "https://acbs.com.vn/a", quote, page: 3 });
const doc: BrokerDoc = {
  asOf: "2026-10-31", lastRun: "2026-10-31T10:00:00Z", running: false, backlog: 2, brokers: { ACBS: { name: "ACBS" }, KBSV: { name: "KBSV" } }, topicNames: { rates: "Lãi suất", fx: "Tỷ giá" },
  coverage: { brokers: 2, listedBrokers: 4, reports: 3, verified: 9, rejected: 1, skippedNoText: 0 }, sources: { BVSC: { at: "x", found: 0, error: "HTTP 500" } },
  reports: [],
  view: { n: 2, items: [{ ...cited("ACBS"), stance: "positive", weight: 0.8 }, { ...cited("KBSV", "Thận trọng trong ngắn hạn"), stance: "negative", weight: 0.5 }], score: 0.23, disagreement: 0.61, nEff: 1.9, dist: { positive: 0.6, neutral: 0, negative: 0.4 } },
  topics: { "ACBS|rates": { ...cited("ACBS", "Chi phí vốn cao"), stance: "negative" } },
  targets: { items: [{ ...cited("KBSV", "VN-Index 1.920"), value: 1920, scenario: "base", horizonEnd: "2026-12" }], horizon: "2026-12", n: 1, median: 1920, q1: 1920, q3: 1920, indexClose: 1741.6, upsidePct: 10.2 },
  sectors: [{ icb: "8300", nameVi: "Ngân hàng", net: 1, n: 2, quantZ: -1, diverges: true, items: [{ ...cited("ACBS", "Ưu tiên ngân hàng"), stance: "positive" }] }],
  changes: [{ ...cited("KBSV"), from: "positive", to: "negative" }],
  ledger: { horizon: 20, minN: 12, baseUpRate: 0.52, brokers: { ACBS: { n: 2, hits: 1, pending: 1, neutral: 0, ready: false, shrunkHit: null } } },
};
const state: { data: BrokerDoc | undefined; error: Error | undefined } = { data: doc, error: undefined };
vi.mock("swr", () => ({ default: () => ({ data: state.data, error: state.error }) }));
vi.mock("../../../../services/marketDataClient", () => ({ fetchMarketJson: async () => ({}) }));

import BrokerConsensus, { disagreementLabel, viewLabel } from "./BrokerConsensus";

afterEach(() => { cleanup(); state.data = doc; state.error = undefined; });
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);

describe("Đồng thuận công ty chứng khoán", () => {
  it("dòng kết luận từ số đã tính, nêu độ phủ và nguồn lỗi", () => {
    render(<BrokerConsensus />);
    expect(q("bc-headline")?.textContent).toContain("Trung lập");
    expect(q("bc-headline")?.textContent).toContain("Bất đồng vừa");
    expect(q("bc-headline")?.textContent).toContain("1.920");
    expect(q("bc-coverage")?.textContent).toContain("2/4 CTCK");
    expect(q("bc-coverage")?.textContent).toContain("còn 2 báo cáo");
    expect(q("bc-source-error")?.textContent).toContain("BVSC");
    expect(q("bc-diverges")).toBeTruthy();
    expect(q("bc-ledger")?.textContent).toContain("đang tích luỹ 2/12");
  });

  it("bấm ô ma trận hoặc mục tiêu thấy câu trích, số trang và link gốc", async () => {
    render(<BrokerConsensus />);
    expect(q("bc-quote")).toBeNull();
    await act(async () => (q("bc-cell-ACBS-rates") as HTMLElement).click());
    expect(q("bc-quote")?.textContent).toContain("Chi phí vốn cao");
    expect(q("bc-quote")?.textContent).toContain("trang 3");
    expect(q("bc-quote")?.querySelector("a")?.getAttribute("href")).toBe("https://acbs.com.vn/a");
    await act(async () => (q("bc-target") as unknown as SVGElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(q("bc-quote")?.textContent).toContain("VN-Index 1.920");
  });

  it("chưa có báo cáo thì nói đang đọc, không dựng số", () => {
    state.data = { ...doc, coverage: { ...doc.coverage, reports: 0 } };
    render(<BrokerConsensus />);
    expect(q("bc-empty")?.textContent).toContain("Đang đọc");
    expect(q("bc-headline")).toBeNull();
    expect(screen).toBeTruthy();
  });

  it("nhãn đồng thuận theo ngưỡng cố định", () => {
    expect([viewLabel(0.5), viewLabel(0), viewLabel(-0.5), viewLabel(null)]).toEqual(["Nghiêng tích cực", "Trung lập", "Nghiêng thận trọng", "Chưa đủ dữ liệu"]);
    expect([disagreementLabel(0.1), disagreementLabel(0.5), disagreementLabel(0.9)]).toEqual(["thấp", "vừa", "cao"]);
  });
});
