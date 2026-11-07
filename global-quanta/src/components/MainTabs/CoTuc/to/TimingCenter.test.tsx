import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToOverview, ToRadarRow, ToSim } from "../../../../lib/cotuc/to";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (o: Partial<ToRadarRow>): ToRadarRow => ({
  t: "HPA", name: null, sector: "Nguyên vật liệu", ex: "2026-11-11", disclosed: "2026-10-30", check: "CONFIRMED_2", cash: 1800, yieldPre: 0.0657, bucket: "≥5%", yieldNow: 0.065,
  lastPrice: 27.7, lastPriceDate: "2026-11-06", adv: 1.7e9, liquidityOk: true, entryDate: "2026-11-02", limitUpEntry: false, qualifies: true, sessionsSinceAnn: 5,
  runUp: 0.0203, runUpPct: 0.52, runUpShareOfTypical: 0.77, buyDate: "2026-11-09", lastCumDate: "2026-11-10", sessionsLeft: 1, t2Ok: false,
  expected: { n: 119, mean: 0.0176, ci95: [0.0081, 0.028], hit: 0.647 }, weakSector: false, label: "THĂM DÒ", ...o,
});
const overview: ToOverview = {
  version: "TO-v1 (2026-11-07)", label: "THĂM DÒ", builtAt: "2026-11-07T13:25:00Z",
  rule: { minYield: 0.05, minAdv: 1e9, costBuy: 0.002, costSell: 0.0025, minHold: 2 }, r1: { start: "2026-11-09", mu0: 0.0176, sigma0: 0.0573, looks: [30, 60] },
  reference: { byBucket: { "<3%": { n: 304, mean: -0.0032, ci95: [-0.011, 0.005], hit: 0.46 }, "3–5%": { n: 160, mean: 0.0083, ci95: [-0.002, 0.018], hit: 0.57 }, "≥5%": { n: 119, mean: 0.0176, ci95: [0.0081, 0.028], hit: 0.647 } },
    rule: { n: 119, mean: 0.0176, ci95: [0.0081, 0.028], hit: 0.647 }, byYear: { 2025: { n: 24, mean: 0.0059, ci95: [-0.012, 0.0215], hit: 0.42 } }, runUp: {}, weakSectors: ["Tiêu dùng"], sectors: {} },
  radar: { asOf: "2026-11-07", priceAsOf: "2026-11-06", rows: [row({}), row({ t: "VNM", sector: "Tiêu dùng", yieldPre: 0.043, bucket: "3–5%", qualifies: false, weakSector: true, runUpPct: 0.8, sessionsLeft: 3, t2Ok: true, ex: "2026-11-14", lastCumDate: "2026-11-13" })] },
  ledger: { registered: "2026-11-07", start: "2026-11-09", label: "THĂM DÒ", nextLook: 30, looks: [], counts: { open: 1, done: 0, void: 0 }, stats: { n: 0, mean: null, ci95: [null, null], hit: null },
    cusum: { S: 0, alarmed: false, h: 4, k: 0.5, mu0: 0.0176, sigma0: 0.0573, quarters: {} },
    entries: [{ id: "HPA|2026-10-30|1800", t: "HPA", sector: null, disclosed: "2026-10-30", cash: 1800, y: 0.0657, adv: 1.7e9, entryDate: "2026-11-10", ex: "2026-11-11", status: "OPEN", result: null }] },
};
const sim: ToSim = { history: { from: "2022-03-01", to: "2026-11-06", trades: 118, hit: 0.67, total: 0.88, vnTotal: 0.15, cagr: 0.144, maxDD: -0.088, vnMaxDD: -0.402, sharpe: 1.67, exposure: 0.24,
  curve: [["2022-03-01", 1, 1], ["2022-06-01", 1.05, 0.8], ["2023-01-03", 1.2, 0.85], ["2026-11-06", 1.88, 1.15]] }, forward: { from: "2026-11-09", trades: 0, curve: [] } };

vi.mock("../../../../hooks/useCorpEvents", () => ({
  useToOverview: () => ({ data: overview, error: null, isLoading: false }),
  useToSim: () => sim,
  useToWindows: (t: string | null) => ({ pooled: { w1: { label: "W1 · Gom sớm trước Mốc 1", n: 682, mean: 0.0147, ci95: [-0.0023, 0.0323], hit: 0.49, knownAtEntry: 0.0015 } }, significant: ["BMP:w1"], tests: 102, ...(t ? { ticker: t, windows: { w1: { n: 10, mean: 0.05, hit: 0.8, p: 0.001, q: 0.08 } } } : {}) }),
}));
vi.mock("../../../../hooks/useBoardQuotes", () => ({ useBoardQuotes: () => ({ quotes: { HPA: { price: 30000 } }, flash: {}, now: 0 }) /* SSI: đồng */ }));
vi.mock("../timeline/BuyTimelineTab", () => ({ BuyTimelineTab: () => <div data-testid="legacy-timeline">bản cũ</div> }));

const { default: TimingCenter } = await import("./TimingCenter");
const { TimelineModes } = await import("../timeline/TimelineModes");
const { notQualifiedReasons } = await import("./ToRadar");

async function mount(node: React.ReactNode) { const el = document.createElement("div"); document.body.appendChild(el); await act(async () => { createRoot(el).render(node); }); return el; }

describe("TO-v1 Thời điểm tối ưu", () => {
  afterEach(() => { document.body.innerHTML = ""; try { localStorage.clear(); } catch { /* */ } });
  it("Radar: đủ điều kiện, lợi suất theo giá trực tiếp, cảnh báo T+2 / ngành yếu, không còn cảnh báo 'đã chạy xa'; không dùng chữ 'mua'", async () => {
    const onSel = vi.fn();
    const el = await mount(<TimingCenter onSelectTicker={onSel} />);
    expect(el.querySelectorAll('[data-testid="to-row"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="to-q-HPA"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="to-t2-HPA"]')).not.toBeNull();
    expect(el.textContent).not.toContain("đã chạy xa");
    expect(el.querySelector('[data-testid="to-radar"]')!.textContent).toContain("6,0%"); // 1.800 đ / 30.000 đ
    expect(el.querySelector('[data-testid="to-radar"]')!.textContent).toContain("ngành yếu");
    expect(el.querySelector('[data-testid="to-label"]')!.textContent).toBe("THĂM DÒ");
    expect(el.querySelector('[data-testid="to-progress"]')!.textContent).toContain("0/30");
    expect(el.querySelector('[data-testid="to-equity"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="to-sim-stats"]')!.textContent).toContain("+88,0%");
    expect(el.textContent).not.toMatch(/vùng mua|MUA NGAY|nên mua/i);
    await act(async () => { (el.querySelectorAll('[data-testid="to-row"]')[0] as HTMLElement).click(); });
    expect(onSel).toHaveBeenCalledWith("HPA");
    const only = el.querySelector<HTMLInputElement>('[data-testid="to-only-q"]')!;
    await act(async () => { only.click(); });
    expect(el.querySelectorAll('[data-testid="to-row"]')).toHaveLength(1);
  });
  it("lý do chưa đủ điều kiện theo đúng quy tắc TO-r1", () => {
    expect(notQualifiedReasons(row({ yieldPre: 0.043, liquidityOk: false, limitUpEntry: true }), 0.05)).toEqual(["lợi suất 4,3% < 5%", "GTGD 20 phiên < 1 tỷ", "phiên vào tăng trần"]);
  });
  it("W1–W5 trên Gateway: tỷ lệ biết GDKHQ lúc vào + kết quả theo mã", async () => {
    const el = await mount(<TimingCenter />);
    const lg = el.querySelector('[data-testid="to-legacy"]')!;
    expect(lg.textContent).toContain("0,2%"); expect(lg.textContent).toContain("HPA: đợt · TB · q"); expect(lg.textContent).toContain("BMP:w1");
  });
  it("Timeline: chế độ cũ giữ nguyên (mặc định), chế độ 2D hiện làn từng đợt", async () => {
    const el = await mount(<TimelineModes />);
    expect(el.querySelector('[data-testid="legacy-timeline"]')).not.toBeNull();
    await act(async () => { el.querySelector<HTMLButtonElement>('[data-testid="timeline-mode-announce"]')!.click(); });
    expect(el.querySelector('[data-testid="legacy-timeline"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="to-lane"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="to-timeline"]')!.textContent).toContain("không kịp T+2");
  });
});
