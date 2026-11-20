import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, render } from "../../../test/rtl-lite";
import type { PreopenDoc } from "../../../hooks/usePreopen";

const sc = (id: "neg" | "mid" | "pos", name: string, lo: number, hi: number) => ({ id, name, trigger: "t", esAnchor: -1, open: null, day: { lo, hi }, n: 30, posture: id === "neg" ? "Thận trọng, chờ xác nhận" : "Khác", probability: null, confirm: "c", invalid: "i", action: "Quy tắc hành động chưa có bằng chứng." });
const doc: PreopenDoc = {
  version: "preopen/1", rule: "PO-r1", asOf: "2026-11-02T01:30:00Z", phase: "pre", session: "2026-11-02", prevDate: "2026-10-30",
  es: { movePct: -1.25, price: 7500, refPrice: 7600, at: "2026-11-02T01:29:00Z" }, lead: "neg", scenarios: [sc("neg", "Tiêu cực", 1700, 1745), sc("mid", "Trung tính", 1718, 1765), sc("pos", "Tích cực", 1735, 1780)],
  trainDays: 250, trainFrom: "2025-10-01", trainTo: "2026-10-30", tracking: null, levels: { close: 1741.6, ma20: 1736.7, ma50: 1773.1, ma200: 1795.1 },
  risk: { label: "calm", probCalm: 0.94, probVolatile: 0.06, volAnnualPct: 14.6, grade: "C", asOf: "2026-10-30" },
  world: [{ group: "us", name: "S&P 500", price: 7000, at: "2026-10-30T20:00:00Z", changePct: -1.5 }, { group: "futures", name: "ES", price: 7500, at: "2026-11-02T01:00:00Z", changePct: -1 }, { group: "asia", name: "Hang Seng", price: null, at: null, changePct: null }],
  evidence: { rule: "PO-r1", openBand: false, dayBand: false, probabilities: false, noPanicSell: false, noChase: false, sample: { tested: 376, from: "2025-04-29", to: "2026-10-30" }, openCoverage: 82.2, dayCoverage: 66.8, brierSkill: 0, history: [{ id: "neg", label: "ES ≤ −0,8%", n: 36, gap: -0.27, oc: -0.15, cc: -0.42 }] },
  timeline: [{ slot: "07:15", lead: "neg", es: -1 }], ledger: { days: 1, scored: 0, openCoverage: null, dayCoverage: null, leadHit: null },
};
const state: { data: PreopenDoc | undefined; error: Error | undefined } = { data: doc, error: undefined };
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("../../../hooks/usePreopen", () => ({ usePreopen: () => ({ data: state.data, error: state.error, isLoading: false }) }));
import MarketCenterPanel from "./MarketCenterPanel";
import FoldSection from "./FoldSection";

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
afterEach(() => { cleanup(); state.data = doc; state.error = undefined; try { localStorage.clear(); } catch { /* bỏ qua */ } });

describe("Trung tâm thị trường", () => {
  it("chưa đạt kiểm định: có kết luận và 3 thẻ, không có %, vùng mở cửa ghi rõ, dải có cảnh báo", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-verdict")?.textContent).toContain("Tiêu cực");
    // PR-A (C-1): cổng G3–G5 chưa đạt thì không hiện tư thế/câu hành động ở đâu cả.
    expect(q("mc-verdict")?.textContent).toContain("Điều kiện ES khớp");
    expect(q("market-center")?.textContent).not.toContain("Thận trọng, chờ xác nhận");
    expect(q("market-center")?.textContent).not.toContain("Quy tắc hành động chưa có bằng chứng.");
    expect(q("mc-verdict-posture")).toBeNull();
    expect(q("mc-posture-off-neg")).toBeTruthy();
    expect(q("mc-no-action")).toBeTruthy();
    expect(q("mc-match-neg")?.textContent).toBe("khớp ES");
    expect(q("market-center")?.textContent).not.toContain("đang dẫn đầu");
    expect(q("mc-verdict")?.textContent).toContain("−1,25%");
    expect(q("mc-no-evidence")).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="mc-card-"]').length).toBe(3);
    expect(document.querySelector('[data-testid^="mc-prob-"]')).toBeNull();
    expect(q("mc-open-neg")?.textContent).toContain("chưa đạt");
    expect(q("mc-day-warning")?.textContent).toContain("66,8%");
    expect(q("market-center")?.textContent).not.toMatch(/\bMUA\b|\bBÁN\b/);
  });
  it("đạt kiểm định thì mới hiện % và vùng mở cửa", () => {
    state.data = { ...doc, evidence: { ...doc.evidence, probabilities: true, openBand: true, dayBand: true }, scenarios: doc.scenarios.map((s) => ({ ...s, probability: 60, open: { lo: 1722, mid: 1728, hi: 1733 } })) };
    render(<MarketCenterPanel />);
    expect(q("mc-prob-neg")?.textContent).toBe("60%");
    expect(q("mc-open-neg")?.textContent).toContain("1.722");
    expect(q("mc-no-evidence")).toBeNull();
    expect(q("mc-day-warning")).toBeNull();
  });
  it("bấm thẻ đổi bản đồ; số thế giới thiếu thì ghi gạch, không tự điền", async () => {
    render(<MarketCenterPanel />);
    expect(q("mc-map")?.querySelector("svg")?.getAttribute("aria-label")).toContain("Tiêu cực");
    await act(async () => (q("mc-card-pos") as HTMLElement).click());
    expect(q("mc-map")?.querySelector("svg")?.getAttribute("aria-label")).toContain("Tích cực");
    expect(q("mc-world-Hang Seng")?.textContent).toContain("—");
    expect(q("mc-regime")?.textContent).toBe("Yên tĩnh");
  });
  it("trong phiên báo kịch bản còn hiệu lực hay đã vô hiệu, có chấm giá", () => {
    state.data = { ...doc, phase: "session", tracking: { open: 1728, last: 1750, gapPct: -0.78, movePct: 0.48, inOpen: null, inDay: false, invalidated: true, current: "mid" } };
    render(<MarketCenterPanel />);
    expect(q("mc-tracking")?.textContent).toContain("đã vô hiệu");
    expect(q("mc-live-dot")).toBeTruthy();
  });
  it("thiếu ES thì không kết luận; dải đạt kiểm định thì ghi rõ; số cũ màu xám; bấm mốc xem lại; thu gọn được", async () => {
    state.data = { ...doc, lead: null, es: { ...doc.es, movePct: null, fresh: false, at: "2026-10-30T21:00:00Z" }, evidence: { ...doc.evidence, dayBand: true, dayCoverage: 80.1 }, world: doc.world.map((w) => ({ ...w, fresh: w.name !== "Hang Seng" })) };
    render(<MarketCenterPanel />);
    expect(q("mc-no-es")?.textContent).toContain("Chưa kết luận");
    expect(q("mc-verdict")?.textContent).not.toContain("đang dẫn đầu");
    expect(q("mc-day-ok")?.textContent).toContain("80,1%");
    expect(q("mc-stale-note")).toBeTruthy();
    expect(q("mc-world-Hang Seng")?.querySelector('[data-stale="1"]')).toBeTruthy();
    await act(async () => (q("mc-slot-07:15") as HTMLElement).click());
    expect(q("mc-slot-view")?.textContent).toContain("Bản 07:15");
    await act(async () => (q("mc-toggle") as HTMLElement).click());
    expect(q("mc-cards")).toBeNull();
    expect(q("mc-verdict")).toBeTruthy();
  });

  it("cổng đạt thì tư thế của đúng kịch bản đó hiện lại (G4 → Tiêu cực; G3 → cả ba)", () => {
    state.data = { ...doc, evidence: { ...doc.evidence, noPanicSell: true } };
    render(<MarketCenterPanel />);
    expect(q("mc-verdict-posture")?.textContent).toContain("Thận trọng, chờ xác nhận");
    expect(q("mc-posture-neg")).toBeTruthy();
    expect(q("mc-posture-pos")).toBeNull();
    expect(q("mc-no-action")).toBeNull();
    cleanup();
    state.data = { ...doc, evidence: { ...doc.evidence, probabilities: true } };
    render(<MarketCenterPanel />);
    expect(document.querySelectorAll('[data-testid^="mc-posture-"]:not([data-testid^="mc-posture-off"])').length).toBe(3);
  });
  it("ô kiểm định đọc từ evidence, không viết cứng", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-gates")?.querySelectorAll('[data-gate="fail"]').length).toBe(3);
    cleanup();
    state.data = { ...doc, evidence: { ...doc.evidence, dayBand: true, openBand: true } };
    render(<MarketCenterPanel />);
    expect(q("mc-gates")?.querySelectorAll('[data-gate="pass"]').length).toBe(2);
    expect(q("mc-gates")?.textContent).toContain("Xác suất: chưa đạt");
  });
  it("dải đạt: ghi rõ là chạy lại trên dữ liệu cũ và nêu độ phủ sổ tiến; sổ có phiên thì có thanh KTC Wilson", () => {
    state.data = { ...doc, evidence: { ...doc.evidence, dayBand: true, dayCoverage: 80.1 }, ledger: { days: 15, scored: 14, openCoverage: 85.7, dayCoverage: 78.6, leadHit: 42.9 } };
    render(<MarketCenterPanel />);
    expect(q("mc-day-ok")?.textContent).toContain("dữ liệu cũ");
    expect(q("mc-day-forward")?.textContent).toContain("14 phiên, phủ 78,6%");
    expect(q("mc-ci-day")?.getAttribute("aria-label")).toMatch(/78,6.*\d+ đến \d+%.*14 phiên.*đích 80%/);
    expect(q("mc-ci-lead")?.textContent).toContain("42,9%");
    expect(q("mc-ledger")?.parentElement?.textContent).toContain("khớp ES đúng");
  });
  it("sổ chưa chấm phiên nào thì không vẽ thanh KTC", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-calibration")).toBeNull();
  });
  it("giờ ES có thứ trong tuần; ngày nghỉ ghi rõ; MS-GARCH ghi phiên tính", () => {
    state.data = { ...doc, phase: "closed", es: { ...doc.es, at: "2026-11-20T21:59:58.000Z" } };
    render(<MarketCenterPanel />);
    expect(q("mc-es-at")?.textContent).toBe("giá ES lúc T7 04:59 21/11 · thị trường đang nghỉ");
    expect(q("mc-risk-asof")?.textContent).toBe("đến phiên 30/10");
  });
  it("trong phiên: thước vị trí trong dải; ngoài dải ghi chữ", () => {
    state.data = { ...doc, phase: "session", tracking: { open: 1728, last: 1722.5, gapPct: -0.78, movePct: -1.1, inOpen: null, inDay: true, invalidated: false, current: "neg" } };
    render(<MarketCenterPanel />);
    expect(q("mc-band-pos")?.textContent).toBe("50%");
    cleanup();
    state.data = { ...doc, phase: "session", tracking: { open: 1728, last: 1690, gapPct: -0.78, movePct: -3, inOpen: null, inDay: false, invalidated: false, current: "neg" } };
    render(<MarketCenterPanel />);
    expect(q("mc-band-pos")?.textContent).toBe("dưới dải");
  });
  it("làm mới lỗi khi còn bản cũ: báo đang hiện bản nào, vẫn giữ nội dung", () => {
    state.error = new Error("HTTP 503");
    render(<MarketCenterPanel />);
    expect(q("mc-stale")?.textContent).toContain("HTTP 503");
    expect(q("mc-stale")?.textContent).toContain("02/11");
    expect(q("mc-cards")).toBeTruthy();
  });
  it("mốc giờ và hàng thế giới có nhãn cho trình đọc màn hình", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-slot-07:15")?.getAttribute("aria-label")).toBe("Mốc 07:15: Tiêu cực, ES −1,00%");
    expect(q("mc-slot-08:30")?.getAttribute("aria-label")).toBe("Mốc 08:30: chưa có bản ghi");
    expect(q("mc-world-Hang Seng")?.getAttribute("aria-label")).toBe("Hang Seng: không có số");
  });

  it("lỗi tải báo rõ; thiếu dữ liệu không vỡ giao diện", () => {
    state.data = undefined; state.error = new Error("HTTP 502");
    render(<MarketCenterPanel />);
    expect(document.querySelector("[role=alert]")?.textContent).toContain("502");
  });
});

describe("Khối rút gọn", () => {
  it("mặc định thu gọn, hiện tóm tắt; mở ra thấy nội dung và nhớ lại", async () => {
    render(<FoldSection id="x" title="Tiêu đề" summary="Tóm tắt"><p>Nội dung</p></FoldSection>);
    const f = q("fold-x") as HTMLElement;
    expect(f.textContent).toContain("Tóm tắt");
    expect(f.textContent).not.toContain("Nội dung");
    await act(async () => (f.querySelector("button") as HTMLElement).click());
    expect(f.textContent).toContain("Nội dung");
    expect(f.textContent).toContain("Rút gọn");
    cleanup();
    render(<FoldSection id="x" title="Tiêu đề"><p>Nội dung</p></FoldSection>);
    expect(q("fold-x")?.textContent).toContain("Nội dung");
  });
});
