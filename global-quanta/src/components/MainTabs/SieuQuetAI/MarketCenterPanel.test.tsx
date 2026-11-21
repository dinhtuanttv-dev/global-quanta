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
const state: { data: PreopenDoc | undefined; error: Error | undefined; ledger: PreopenLedgerDoc | undefined } = { data: doc, error: undefined, ledger: undefined };
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("../../../hooks/usePreopen", () => ({
  usePreopen: () => ({ data: state.data, error: state.error, isLoading: false }),
  usePreopenLedger: () => ({ data: state.ledger, error: undefined }),
}));
import type { PreopenLedgerDoc } from "../../../hooks/usePreopen";
import MarketCenterPanel from "./MarketCenterPanel";
import FoldSection from "./FoldSection";

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
/** PR-C: tầng 2 mặc định đóng; mở sẵn một tab trước khi render. */
const tab = (t: "map" | "world" | "morning" | "trust" | "labels") => localStorage.setItem("gq.marketCenterTab", t);
const clickTab = async (t: string) => act(async () => (document.querySelector(`[data-mc-tab="${t}"]`) as HTMLElement).click());
afterEach(() => { cleanup(); state.data = doc; state.error = undefined; state.ledger = undefined; try { localStorage.clear(); } catch { /* bỏ qua */ } });

// preopen/3 (PR-B): posture/action null từ API, xác nhận PO-r2-F, đường cơ sở, theo dõi trực tiếp, độ nhạy ES.
const rate = (k: number, n: number, lo: number, hi: number) => ({ n, k, pct: Math.round((k / n) * 1000) / 10, lo, hi });
const v3 = (over: Partial<PreopenDoc> = {}): PreopenDoc => ({
  ...doc, version: "preopen/3", scenarios: doc.scenarios.map((s) => ({ ...s, posture: null, action: null })),
  evidence: { ...doc.evidence, rule: "PO-r2", dayBand: true, dayCoverage: 80.1, confirm: { rule: "PO-r2-F", need: 60, n: 14, coverage: 78.6, wilsonLo: 52.4, wilsonHi: 92.4, range: [72, 88], target: 80, status: "confirming", decidedOn: null, afterRegistration: rate(0, 1, 0, 0) } },
  ledger: { days: 15, scored: 14, openCoverage: 85.7, dayCoverage: 78.6, leadHit: 42.9, lead: rate(6, 14, 21.4, 67.4), alwaysMid: rate(5, 14, 16.3, 61.2) },
  esFit: { slope: 0.42, intercept: 0.05, residLo: -0.61, residHi: 0.58, vol: 1.1, n: 250, grade: "C" }, nextRefreshAt: "2026-11-02T01:35:00Z",
  ...over,
});
describe("Trung tâm thị trường — preopen/3", () => {
  it("API trả posture null: không hiện tư thế dù cổng giao diện mở (hai lớp)", () => {
    state.data = v3({ evidence: { ...v3().evidence, probabilities: true } });
    render(<MarketCenterPanel />);
    expect(q("mc-verdict-posture")).toBeNull();
    expect(document.querySelector('[data-testid^="mc-posture-"]:not([data-testid^="mc-posture-off"])')).toBeNull();
  });
  it("đang xác nhận PO-r2-F: ghi n/60 và luật đăng ký trước", () => {
    state.data = v3();
    render(<MarketCenterPanel />);
    expect(q("mc-day-forward")?.textContent).toBe("Đang xác nhận theo PO-r2-F (đăng ký trước): 14/60 phiên, phủ 78,6%. Kết luận khi đủ 60 phiên.");
  });
  it("PO-r2-F không đạt: API hạ dayBand, giao diện nêu lý do cụ thể", () => {
    const base = v3();
    state.data = v3({ evidence: { ...base.evidence, dayBand: false, confirm: { ...base.evidence.confirm!, n: 60, coverage: 65, wilsonLo: 52.4, wilsonHi: 75.9, status: "failed", decidedOn: "2027-01-27" } } });
    tab("trust");
    render(<MarketCenterPanel />);
    expect(q("mc-day-warning")?.textContent).toContain("KHÔNG ĐẠT xác nhận tiến PO-r2-F");
    expect(q("mc-day-warning")?.textContent).toContain("72–88%");
    expect(q("mc-gates")?.textContent).toContain("Dải cả phiên: chưa đạt");
  });
  it("so với đường cơ sở luôn đoán Trung tính; khoảng chồng nhau thì không kết luận", () => {
    state.data = v3(); tab("trust");
    render(<MarketCenterPanel />);
    expect(q("mc-ci-lead")?.getAttribute("aria-label")).toContain("luôn đoán Trung tính 35,7%");
    expect(q("mc-ci-note")?.textContent).toContain("chưa thấy khác biệt rõ");
  });
  it("độ nhạy ES mô tả cấp C", () => {
    state.data = v3(); tab("morning");
    render(<MarketCenterPanel />);
    expect(q("mc-esfit")?.textContent).toContain("ES đổi 1% thì mở cửa VN-Index dịch trung bình +0,42%");
    expect(q("mc-esfit")?.textContent).toContain("−0,61% đến +0,58%");
  });
  it("theo dõi trực tiếp có giờ và nguồn; giờ vô hiệu lần đầu được giữ khi giá quay lại", () => {
    state.data = v3({ phase: "session", tracking: { open: 1728, last: 1722.5, gapPct: -0.78, movePct: -1.1, inOpen: null, inDay: true, invalidated: false, current: "neg", at: "2026-11-02T03:42:10Z", source: "live", pctInBand: 50, invalidatedAt: "2026-11-02T02:15:00Z", invalidatedLast: 1742.3 } });
    render(<MarketCenterPanel />);
    expect(q("mc-track-src")?.textContent).toBe("Giá trực tiếp lúc 10:42, cùng nguồn với thanh trên cùng.");
    expect(q("mc-invalidated-at")?.textContent).toContain("Vô hiệu lần đầu lúc 09:15 (VN-Index 1.742,3)");
    expect(q("mc-tracking")?.textContent).toContain("từng vô hiệu, giá đã quay lại");
  });
  it("nến ngày dự phòng thì ghi rõ có thể trễ", () => {
    state.data = v3({ phase: "session", tracking: { open: 1728, last: 1722.5, gapPct: -0.78, movePct: -1.1, inOpen: null, inDay: true, invalidated: false, current: "neg", at: null, source: "daily" } });
    render(<MarketCenterPanel />);
    expect(q("mc-track-src")?.textContent).toContain("nến ngày");
  });
  it("dải từng phiên của sổ tiến: cũ → mới, nhãn đọc được, đánh dấu ngoài dải", () => {
    state.data = v3();
    state.ledger = { rule: "PO-r2", asOf: "", confirm: v3().evidence.confirm!, lead: rate(1, 2, 9, 90), alwaysMid: rate(1, 2, 9, 90), rows: [
      { date: "2026-11-20", slot: "08:50", es: -0.4, lead: "mid", day: { lo: 1670, hi: 1705 }, prevClose: 1689, open: 1671, close: 1688.8, gapPct: -1, ccPct: -0.01, outcome: "mid", dayIn: true, leadHit: true },
      { date: "2026-11-19", slot: "08:50", es: -1.5, lead: "neg", day: { lo: 1690, hi: 1720 }, prevClose: 1700, open: 1700, close: 1689.6, gapPct: 0, ccPct: -0.6, outcome: "neg", dayIn: false, leadHit: true },
    ] };
    tab("trust");
    render(<MarketCenterPanel />);
    const cells = document.querySelectorAll('[data-testid="mc-strip-cell"]');
    expect(cells.length).toBe(2);
    expect(cells[0].getAttribute("aria-label")).toContain("19/11: kết quả Giảm (−0,60%), ngoài dải cả phiên 1.690–1.720");
    expect(cells[0].getAttribute("data-in")).toBe("0");
    expect(cells[1].getAttribute("aria-label")).toContain("— đúng");
  });
  it("Gateway cũ (preopen/2) vẫn hiển thị bình thường", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-esfit")).toBeNull();
    expect(q("mc-strip")).toBeNull();
    expect(q("mc-cards")).toBeTruthy();
  });
});

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
    tab("map");
    render(<MarketCenterPanel />);
    expect(q("mc-map")?.querySelector("svg")?.getAttribute("aria-label")).toContain("Tiêu cực");
    await act(async () => (q("mc-card-pos") as HTMLElement).click());
    expect(q("mc-map")?.querySelector("svg")?.getAttribute("aria-label")).toContain("Tích cực");
    await clickTab("world");
    expect(q("mc-map")).toBeNull();
    expect(q("mc-world-Hang Seng")?.textContent).toContain("—");
    await clickTab("trust");
    expect(q("mc-regime")?.textContent).toBe("Yên tĩnh");
  });
  it("trong phiên báo kịch bản còn hiệu lực hay đã vô hiệu, có chấm giá", () => {
    state.data = { ...doc, phase: "session", tracking: { open: 1728, last: 1750, gapPct: -0.78, movePct: 0.48, inOpen: null, inDay: false, invalidated: true, current: "mid" } };
    tab("map");
    render(<MarketCenterPanel />);
    expect(q("mc-tracking")?.textContent).toContain("đã vô hiệu");
    expect(q("mc-live-dot")).toBeTruthy();
  });
  it("thiếu ES thì không kết luận; dải đạt kiểm định thì ghi rõ; số cũ màu xám; bấm mốc xem lại; thu gọn được", async () => {
    state.data = { ...doc, lead: null, es: { ...doc.es, movePct: null, fresh: false, at: "2026-10-30T21:00:00Z" }, evidence: { ...doc.evidence, dayBand: true, dayCoverage: 80.1 }, world: doc.world.map((w) => ({ ...w, fresh: w.name !== "Hang Seng" })) };
    tab("world");
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
    tab("trust");
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
    tab("trust");
    render(<MarketCenterPanel />);
    expect(q("mc-day-ok")?.textContent).toContain("dữ liệu cũ");
    expect(q("mc-day-forward")?.textContent).toContain("14 phiên, phủ 78,6%");
    expect(q("mc-ci-day")?.getAttribute("aria-label")).toMatch(/78,6.*\d+ đến \d+%.*14 phiên.*đích 80%/);
    expect(q("mc-ci-lead")?.textContent).toContain("42,9%");
    expect(q("mc-ledger")?.parentElement?.textContent).toContain("khớp ES đúng");
  });
  it("sổ chưa chấm phiên nào thì không vẽ thanh KTC", () => {
    tab("trust");
    render(<MarketCenterPanel />);
    expect(q("mc-calibration")).toBeNull();
  });
  it("giờ ES có thứ trong tuần; ngày nghỉ ghi rõ; MS-GARCH ghi phiên tính", () => {
    state.data = { ...doc, phase: "closed", es: { ...doc.es, at: "2026-11-20T21:59:58.000Z" } };
    tab("trust");
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
    tab("world");
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

describe("Trung tâm thị trường — 3 tầng (PR-C)", () => {
  it("mặc định: tầng 0 + tầng 1 hiện, tầng 2 đóng; 5 tab đúng thứ tự", () => {
    render(<MarketCenterPanel />);
    expect(q("mc-tier0")).toBeTruthy();
    expect(q("mc-verdict")).toBeTruthy();
    expect(q("mc-cards")).toBeTruthy();
    expect(q("mc-tabpanel")).toBeNull();
    expect(Array.from(document.querySelectorAll("[data-mc-tab]")).map((b) => b.textContent)).toEqual(["Bản đồ giá", "Thế giới", "Sáng nay", "Độ tin cậy", "Các nhãn đo gì"]);
    expect(Array.from(document.querySelectorAll("[data-mc-tab]")).every((b) => b.getAttribute("aria-selected") === "false")).toBe(true);
  });
  it("bấm tab mở, bấm lại đóng; nhớ tab theo trình duyệt", async () => {
    render(<MarketCenterPanel />);
    await clickTab("morning");
    expect(q("mc-morning")).toBeTruthy();
    expect(localStorage.getItem("gq.marketCenterTab")).toBe("morning");
    expect(q("mc-tabpanel")?.getAttribute("aria-labelledby")).toBe("mc-tab-morning");
    await clickTab("morning");
    expect(q("mc-tabpanel")).toBeNull();
    expect(localStorage.getItem("gq.marketCenterTab")).toBe("");
  });
  it("phím mũi tên chuyển tab (roving tabindex)", async () => {
    tab("map");
    render(<MarketCenterPanel />);
    const first = document.querySelector('[data-mc-tab="map"]') as HTMLElement;
    expect(first.getAttribute("tabindex")).toBe("0");
    await act(async () => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(document.querySelector('[data-mc-tab="world"]')?.getAttribute("aria-selected")).toBe("true");
    await act(async () => { (document.querySelector('[data-mc-tab="world"]') as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(q("mc-labels")).toBeTruthy();
  });
  it("tab Sáng nay: các mốc, thay đổi giữa mốc, mốc chưa đến ghi rõ", () => {
    state.data = { ...doc, timeline: [{ slot: "07:15", lead: "neg", es: -1, at: "2026-11-02T00:15:30Z" }, { slot: "08:30", lead: "neg", es: -1.4, at: "2026-11-02T01:30:20Z" }] };
    tab("morning");
    render(<MarketCenterPanel />);
    expect(q("mc-morning-07:15")?.textContent).toContain("07:15");
    expect(q("mc-morning-08:30")?.textContent).toContain("−0,40 điểm %");
    expect(q("mc-morning-08:50")?.textContent).toContain("chưa đến mốc");
    expect(q("mc-history")).toBeTruthy();
  });
  it("nguồn gốc từng ô: bấm ⓘ mở bảng nguồn, Esc đóng", async () => {
    render(<MarketCenterPanel />);
    const btn = q("mc-prov-es")?.querySelector("button") as HTMLElement;
    expect(btn.getAttribute("aria-label")).toBe("Nguồn gốc: ES qua đêm");
    await act(async () => btn.click());
    const dlg = q("mc-prov-es")?.querySelector('[role="dialog"]');
    expect(dlg?.textContent).toContain("Yahoo Finance");
    expect(dlg?.textContent).toContain("15:00 phiên 30/10");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(q("mc-prov-es")?.querySelector('[role="dialog"]')).toBeNull();
  });
  it("nguồn gốc dải cả phiên: cấp theo kiểm định (chưa đạt → C)", async () => {
    render(<MarketCenterPanel />);
    await act(async () => (q("mc-prov-day")?.querySelector("button") as HTMLElement).click());
    expect(q("mc-prov-day")?.querySelector('[data-grade]')?.getAttribute("data-grade")).toBe("C");
  });
  it("bảng Các nhãn đo gì: đủ 6 nhãn chế độ + 4 thước đo biến động; thiếu dữ liệu khối khác thì ghi gạch", () => {
    tab("labels");
    render(<MarketCenterPanel />);
    expect(document.querySelectorAll('[data-testid="mc-label-row"]').length).toBe(10);
    expect(document.querySelector('[data-label-value="MS-GARCH"]')?.textContent).toBe("Yên tĩnh 94%");
    expect(document.querySelector('[data-label-value="σ MS-GARCH"]')?.textContent).toBe("14,6%/năm");
    expect(document.querySelector('[data-label-value="Kịch bản mở cửa"]')?.textContent).toBe("Tiêu cực · ES −1,25%");
    expect(document.querySelector('[data-label-value="THẾ GIỚI"]')?.textContent).toBe("—");
    expect(q("mc-labels")?.textContent).toContain("không so trực tiếp");
  });
  it("Trading Matrix gửi sự kiện thì mở tab Các nhãn đo gì", async () => {
    render(<MarketCenterPanel />);
    await act(async () => { window.dispatchEvent(new Event("gq:market-center-labels")); });
    expect(q("mc-labels")).toBeTruthy();
  });
  it("tầng 0 báo số thị trường dùng số phiên trước", () => {
    state.data = { ...doc, world: doc.world.map((w) => ({ ...w, fresh: w.name !== "Hang Seng" })) };
    render(<MarketCenterPanel />);
    expect(q("mc-quality")?.textContent).toBe("◌ 1 thị trường dùng số phiên trước");
  });
});

describe("Trung tâm thị trường — PR-D", () => {
  it("trong phiên: ES đang chạy sang nhóm khác thì báo, kịch bản vẫn giữ bản đã chốt", () => {
    state.data = { ...doc, phase: "session", lead: "neg", liveLead: "pos", esEdge: 0.89, es: { ...doc.es, livePct: 1.2, frozenAt: "08:50" } };
    render(<MarketCenterPanel />);
    expect(q("mc-es-shift")?.textContent).toBe("⇄ ES hiện +1,20% đã sang nhóm Tích cực (ngưỡng ±0,89%). Kịch bản phiên vẫn giữ theo bản 08:50; chỉ để tham khảo.");
    expect(q("mc-verdict")?.textContent).toContain("Tiêu cực");
  });
  it("trong phiên: cùng nhóm thì không báo", () => {
    state.data = { ...doc, phase: "session", lead: "neg", liveLead: "neg", es: { ...doc.es, livePct: -1.5, frozenAt: "08:50" } };
    render(<MarketCenterPanel />);
    expect(q("mc-es-shift")).toBeNull();
  });
  it("trước giờ mở cửa sau 08:50: nói rõ phiên sẽ giữ bản 08:50", () => {
    state.data = { ...doc, phase: "pre", lead: "mid", es: { ...doc.es, movePct: -0.3 }, timeline: [{ slot: "07:15", lead: "neg", es: -1.1 }, { slot: "08:50", lead: "neg", es: -1 }] };
    render(<MarketCenterPanel />);
    expect(q("mc-es-shift")?.textContent).toContain("phiên sẽ giữ theo bản 08:50: Tiêu cực (ES −1,00%)");
  });
  it("trước giờ mở cửa giữa hai mốc: báo kịch bản đổi so với mốc trước", () => {
    state.data = { ...doc, phase: "pre", lead: "mid", es: { ...doc.es, movePct: -0.3 }, timeline: [{ slot: "07:15", lead: "neg", es: -1.1 }] };
    render(<MarketCenterPanel />);
    expect(q("mc-es-shift")?.textContent).toContain("Kịch bản đổi so với bản 07:15: Tiêu cực → Trung tính");
  });
  it("Gateway chưa có liveLead (preopen/3 cũ) thì không báo gì", () => {
    state.data = { ...doc, phase: "session", es: { ...doc.es, livePct: 3, frozenAt: "08:50" } };
    render(<MarketCenterPanel />);
    expect(q("mc-es-shift")).toBeNull();
  });
  it("tab Sáng nay ngày nghỉ: ghi chờ phiên kế tiếp thay vì chưa đến mốc", () => {
    state.data = { ...doc, phase: "closed", session: "2026-11-23", timeline: [] };
    tab("morning");
    render(<MarketCenterPanel />);
    expect(q("mc-morning-07:15")?.textContent).toContain("chờ phiên 23/11");
  });
  it("Bản đồ giá ngoài phiên: chưa có sổ thì không vẽ phần xem lại", () => {
    tab("map");
    render(<MarketCenterPanel />);
    expect(q("mc-map")).toBeTruthy();
    expect(q("mc-path")).toBeNull();
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
