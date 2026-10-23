import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import IndexImpactTable from "./IndexImpactTable";
import type { IndexImpactDoc } from "../../../../hooks/useTradingMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement | null = null;
afterEach(() => { el?.remove(); el = null; });

const item = (symbol: string, points: number, industry = "Ngân hàng") => ({ symbol, industry, group: "Tài chính", close: 1, changePct: points / 2, weightPct: 3, points, value: 1e9, adjusted: null });
const doc = (status: "MATCH" | "DEVIATION"): IndexImpactDoc => ({
  version: "v", index: "VNINDEX", date: "2026-10-21", items: [item("VCB", 9.1), item("BID", 3.2), item("VHM", -2.3, "Bất động sản")],
  check: { predictedPoints: 10, actualPoints: status === "MATCH" ? 10 : 9, predictedPct: 0.6, actualPct: status === "MATCH" ? 0.6 : 0.54, diffPp: status === "MATCH" ? 0 : 0.06, status },
  coverage: { symbols: 419, of: 429, missing: ["XYZ"] }, sectors: [{ industry: "Ngân hàng", group: "Tài chính", points: 12.3, up: 2, down: 0, n: 2 }, { industry: "Bất động sản", group: "Bất động sản", points: -2.3, up: 0, down: 1, n: 1 }],
  sharesSource: "VNDirect finfo OUTSTANDING_SHARES", sharesAsOf: "2026-10-22T03:00:00Z", sharesWarning: null, method: "c_i = …", vn30Note: "VN30 …",
});

function render(d: IndexImpactDoc, sel: string[] = [], ind: (string | null)[] = []) {
  el = document.createElement("div"); document.body.appendChild(el);
  act(() => createRoot(el!).render(<IndexImpactTable data={d} onSelect={(t) => sel.push(t)} onIndustry={(n) => ind.push(n)} />));
  return el;
}

describe("IndexImpactTable", () => {
  it("kéo / đè chỉ số, kiểm tra khớp, độ phủ; bấm mã chọn mã, bấm ngành lọc bảng", () => {
    const sel: string[] = [], ind: (string | null)[] = [];
    const e = render(doc("MATCH"), sel, ind);
    expect(e.textContent).toContain("Kéo chỉ số tăng");
    expect(e.textContent).toContain("+9,10");
    expect(e.textContent).toContain("-2,30");
    expect(e.querySelector("[data-testid=mx-impact-check]")?.textContent).toContain("khớp");
    expect(e.textContent).toContain("419/429 mã HOSE");
    act(() => (e.querySelector("[aria-label='Chọn BID']") as HTMLButtonElement).click());
    act(() => (Array.from(e.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Bất động sản")) as HTMLButtonElement).click());
    expect(sel).toEqual(["BID"]);
    expect(ind).toEqual(["Bất động sản"]);
  });
  it("trong phiên: đang tải / ngoài giờ -> thông báo, không vẽ số; có dữ liệu -> nhãn 'Trong phiên' + giờ lấy giá", () => {
    expect(render({ ...doc("MATCH"), live: true, pending: true, reason: "Đang tải giá trong phiên" }).querySelector("[data-testid=mx-impact-pending]")?.textContent).toContain("Đang tải");
    el?.remove();
    expect(render({ ...doc("MATCH"), live: false, reason: "Ngoài giờ giao dịch" }).textContent).toContain("Ngoài giờ");
    el?.remove();
    expect(render({ ...doc("MATCH"), live: true, horizon: "intraday", asOf: "2026-10-23T03:30:00Z", prevSession: "2026-10-22" }).textContent).toContain("Trong phiên");
  });
  it("lệch > 0,05 điểm % -> cảnh báo rõ, không che", () => {
    expect(render(doc("DEVIATION")).querySelector("[data-testid=mx-impact-check]")?.textContent).toContain("lệch");
  });
});
