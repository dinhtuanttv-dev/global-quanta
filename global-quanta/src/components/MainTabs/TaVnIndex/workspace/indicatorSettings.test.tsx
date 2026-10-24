// R5 — tham số chỉ báo: làm sạch (giống hệt Gateway), RSI Cutler, AVWAP neo tay, form chỉnh trong menu Lớp.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_INDICATORS, paneTitles, sanitizeIndicators } from "./indicatorSettings";
// @ts-expect-error -- module JS của Gateway (không có khai báo kiểu); so trực tiếp để bảo đảm hai phía làm sạch giống hệt.
import { sanitizeIndicators as gatewaySanitize } from "../../../../../backend/src/market/watchlists/userWorkspace.js";
import { calculateRSI } from "../../../../lib/ta-command-center/detectors/technicalOscillators";
import { manualAvwap } from "../TVChartPanel";
import IndicatorSettingsForm from "./IndicatorSettingsForm";
import { sanitizeWorkspace } from "./workspaceModel";

const bars = Array.from({ length: 40 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 10, high: 11, low: 9, close: 10 + Math.sin(i / 2) * 2 + i * 0.05, volume: 1000 + i * 10 }));

describe("R5 — làm sạch tham số", () => {
  const cases: unknown[] = [
    {}, null, { rsi: { period: 500, upper: 80, lower: 1, method: "evil" } }, { macd: { fast: 30, slow: 20, signal: 0 } },
    { adx: { period: "abc", threshold: 99 }, vprofile: { bars: 1e6, method: "uniform" } },
    { avwap: { anchors: { FPT: "2026-03-02", "bad ticker": "2026-01-01", HPG: "<script>", VNINDEX: "2026-03-02T09:15:00+07:00" } } },
  ];
  it("frontend và Gateway cho CÙNG kết quả với mọi đầu vào", () => {
    for (const c of cases) expect(sanitizeIndicators(c)).toEqual(gatewaySanitize((c ?? {}) as object));
  });
  it("mặc định = công thức chuẩn; workspace cũ (không có indicators) -> mặc định", () => {
    expect(sanitizeIndicators(undefined)).toEqual(DEFAULT_INDICATORS);
    expect(sanitizeWorkspace({ preset: "clean" }).indicators).toEqual(DEFAULT_INDICATORS);
    expect(paneTitles(DEFAULT_INDICATORS)).toEqual({ rsi: "RSI 14 · 70 / 30", macd: "MACD 12/26/9", adx: "ADX 14 · +DI / −DI · ngưỡng 25" });
  });
});

describe("R5 — RSI Cutler + AVWAP neo tay", () => {
  it("Cutler = trung bình cộng lãi / lỗ của đúng `period` phiên gần nhất", () => {
    const r = calculateRSI(bars as never, 14, "cutler");
    const naive = (i: number) => {
      let g = 0, l = 0;
      for (let k = i - 13; k <= i; k++) { const d = bars[k].close - bars[k - 1].close; if (d > 0) g += d; else l -= d; }
      return l === 0 ? 100 : 100 - 100 / (1 + g / l);
    };
    for (const i of [14, 20, 39]) expect(r.series[i]).toBeCloseTo(naive(i), 9);
    expect(r.series[13]).toBeNull();
    const flat = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 }));
    expect(calculateRSI(flat as never, 14, "cutler")).toMatchObject({ latest: 50, flat: true });
  });
  it("neo tay: bắt đầu tại nến đầu tiên có ngày ≥ ngày neo; ngoài dữ liệu -> null (dùng tự động)", () => {
    const a = manualAvwap(bars as never, "2026-01-10")!;
    expect(a).toMatchObject({ anchorDate: "2026-01-10", manual: true });
    expect(a.points[0].date).toBe("2026-01-10");
    expect(manualAvwap(bars as never, "2027-01-01")).toBeNull();
    expect(manualAvwap(bars as never, null)).toBeNull();
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("R5 — form tham số trong menu Lớp", () => {
  it("nhập số -> kẹp miền khi rời ô; 'Mặc định' trả về chuẩn; AVWAP: chọn trên chart / về tự động", () => {
    const changes: unknown[] = []; let picked = 0, cleared = 0;
    let value = DEFAULT_INDICATORS;
    const el = document.createElement("div"); document.body.appendChild(el);
    const draw = (anchor: string | null) => act(() => root!.render(<IndicatorSettingsForm value={value} onChange={(v) => { changes.push(v); value = v; draw(anchor); }}
      ticker="FPT" anchor={anchor} onPickAnchor={() => picked++} onClearAnchor={() => cleared++} />));
    root = createRoot(el); draw(null);
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    act(() => q("settings-btn-rsi").click());
    const input = q("set-rsi-period") as HTMLInputElement;
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(input, "500"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(value.rsi.period).toBe(100);
    expect(q("settings-btn-rsi").textContent).toContain("•");
    act(() => q("settings-reset-rsi").click());
    expect(value.rsi).toEqual(DEFAULT_INDICATORS.rsi);
    act(() => q("settings-btn-avwap").click());
    expect(q("set-avwap-state").textContent).toContain("tự động");
    act(() => q("set-avwap-pick").click());
    expect(picked).toBe(1);
    draw("2026-03-02");
    expect(q("set-avwap-state").textContent).toContain("2026-03-02");
    act(() => q("set-avwap-auto").click());
    expect(cleared).toBe(1);
    expect(changes.length).toBe(2);
  });
});
