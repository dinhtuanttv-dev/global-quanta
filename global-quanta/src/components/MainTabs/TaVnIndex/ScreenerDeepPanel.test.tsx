import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import PatternSketch, { sketchWindow } from "./PatternSketch";
import { componentValue } from "./ScreenerDeepPanel";
import type { TechnicalFilterResult } from "../../../hooks/useTechnicalFilter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const bars = Array.from({ length: 220 }, (_, i) => {
  const c = 100 - 20 * Math.sin((Math.PI * Math.min(i, 180)) / 180) + (i > 180 ? -2 : 0);
  return { date: day(i), open: c, high: c + 1, low: c - 1, close: c, volume: 1000 };
});
const result = {
  ticker: "TEST", status: "SETUP", grade: "B", date: day(219),
  metrics: { score: 61, pivot: 101, belowPivotPct: 2 },
  plan: { entry: 99, stop: 95, target: 119, riskPct: 4, rr: 5, buyZoneTop: 106 },
  pattern: {
    status: "SETUP", leftLipIdx: 0, cupLowIdx: 90, rightLipIdx: 180, handleLowIdx: 200,
    leftLipDate: day(5), cupLowDate: day(90), rightLipDate: day(180), handleLowDate: day(200),
    leftLip: 101, cupLow: 79, rightLip: 100, handleLow: 96, pivot: 101,
    depthPct: 22, handleDepthPct: 4, cupBars: 175, handleBars: 39, uShape: true, handleVolDry: true, belowPivotPct: 2,
  },
  handle: {
    rightLeg: { from: { date: day(90), price: 79 }, to: { date: day(180), price: 100 } }, retracePct: 19,
    fib: [{ ratio: 0.236, price: 95 }], wave: null, abc: null, avwap: 95.5, poc: 90,
    clusters: [], best: { price: 95.3, low: 95, high: 95.5, weight: 1.8, sources: ["Fib 23,6%", "AVWAP"] },
    handleAtConfluence: true, earlyEntry: { price: 95.5, stop: 93.6, riskPct: 2 },
  },
} as unknown as TechnicalFilterResult;

describe("Bảng phụ phân tích chuyên sâu", () => {
  it("cửa sổ mẫu hình bắt đầu trước miệng trái cốc 15 phiên (giới hạn đầu chuỗi)", () => {
    expect(sketchWindow(bars, result)).toEqual({ from: 0, to: 219 });
  });

  it("vẽ đường cốc, tay cầm, hợp lưu và nhãn chữ cho mọi mức giá", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(<PatternSketch bars={bars} result={result} strategy="camslim" />));
    const text = el.textContent ?? "";
    for (const s of ["Pivot 101", "Cắt lỗ 95", "Mục tiêu 119", "Vùng mua", "Hợp lưu 95–96", "Đường cốc", "Tay cầm"]) expect(text).toContain(s);
    expect(el.querySelectorAll("path").length).toBeGreaterThanOrEqual(2); // đường cốc + điểm mua sớm
  });

  it("giá trị thành phần đúng đơn vị", () => {
    const c = (key: string, value: number | boolean | null) => ({ key, label: "", max: 1, points: 0, ok: true, value }) as never;
    expect(componentValue(c("cQuarter", 0.58))).toBe("+58%");
    expect(componentValue(c("cQuarter", 9.99))).toBe("từ lỗ sang lãi");
    expect(componentValue(c("aRoe", 0.247))).toBe("24,7%");
    expect(componentValue(c("lRs", 76))).toBe("RS 76");
    expect(componentValue(c("iForeign", -8e11))).toBe("−800,0 tỷ");
    expect(componentValue(c("market", false))).toBe("không");
    expect(componentValue(c("aAnnual", null))).toBe("chưa có dữ liệu");
  });
});
