// A1 — bền vững: lỗi một panel không làm trắng tab; Worker / phân tích lỗi không treo, không giữ kết quả cũ; bộ EMA/MA + Ichimoku.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import PanelBoundary from "./PanelBoundary";
import { runAnalysis } from "../../../../lib/quant-core/runner";
import { AnalysisController } from "../../../../lib/ta-command-center/AnalysisController";
import { buildScene } from "../../../../lib/ta-command-center/chart/buildScene";
import { DEFAULT_LAYER_STATE } from "../../../../lib/ta-command-center/LayerManager";
import { EMPTY_SMC } from "../../../../lib/ta-command-center/AnalysisController";
import { ichimoku, movingAverageSet } from "../../../../lib/ta-command-center/detectors/movingAverages";
import { priceExtrasReader } from "../TVChartPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const bars = Array.from({ length: 120 }, (_, i) => ({ date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i, volume: 1000 }));

describe("A1 — cô lập lỗi theo panel", () => {
  it("panel lỗi -> khung báo lỗi + Thử lại, panel khác vẫn hiện; đổi resetKey -> thử lại", () => {
    let boom = true;
    const Bad = () => { if (boom) throw new Error("hỏng dữ liệu"); return <p>đã ổn</p>; };
    const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    const err = console.error; console.error = () => {};
    const draw = (key: string) => act(() => root!.render(<div><PanelBoundary label="Elliott Pro" resetKey={key}><Bad /></PanelBoundary><p data-testid="other">panel khác</p></div>));
    draw("FPT");
    expect(el.querySelector("[data-testid=panel-error]")?.textContent).toContain("Không hiển thị được Elliott Pro");
    expect(el.querySelector("[data-testid=other]")).not.toBeNull();
    boom = false; draw("HPG");
    expect(el.textContent).toContain("đã ổn");
    console.error = err;
  });
});

describe("A1 — phân tích lỗi không treo / không giữ kết quả cũ", () => {
  it("runAnalysis: analyze ném lỗi -> gọi onError (không nuốt)", () => {
    let msg: string | null = null, ok = false;
    runAnalysis(null as never, {}, () => { ok = true; }, (m) => { msg = m; });
    expect(ok).toBe(false);
    expect(msg).toBeTruthy();
  });
  it("controller: lỗi -> xoá SMC cũ + phát analysis:error; thử lại thành công -> xoá lỗi", () => {
    const c = new AnalysisController(bars as never, { isIndex: true });
    expect(c.getAnalysis()).not.toBeNull();
    const errs: (string | null)[] = []; c.onAnalysisError((m) => errs.push(m));
    (c as unknown as { bars: unknown }).bars = null; // dữ liệu hỏng
    c.retryAnalysis();
    expect(errs[errs.length - 1]).toBeTruthy();
    expect(c.getAnalysis()).toBeNull();
    expect(c.getSmc()).toBe(EMPTY_SMC);
    (c as unknown as { bars: unknown }).bars = bars;
    c.retryAnalysis();
    expect(errs[errs.length - 1]).toBeNull();
    c.destroy();
  });
});

describe("25/10 — EMA 21/50/100 · MA 200 + mây Ichimoku", () => {
  it("chú giải theo crosshair đọc đúng giá trị; mây tại nến i lấy Senkou tính tại i − 26", () => {
    const ma = movingAverageSet(bars as never), ichi = ichimoku(bars as never);
    const read = priceExtrasReader(ma, ichi);
    const row = read(100);
    expect(row.map((x) => x.label)).toEqual(["EMA 21", "EMA 50", "EMA 100", "MA 200", "Tenkan", "Kijun", "Mây A/B"]);
    expect(row[3].value).toBe("—"); // MA 200 chưa đủ 200 nến
    expect(row[6].value).toBe(`${ichi.spanA[74]!.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} / ${ichi.spanB[74]!.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`);
    expect(priceExtrasReader(null, null)(5)).toEqual([]);
  });
  it("mây chỉ vẽ khi bật lớp; điểm cuối nằm ở vùng tương lai (+26 nến)", () => {
    const ichi = ichimoku(bars as never);
    const base = { bars: bars as never, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, ichimoku: ichi };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items.some((i) => i.kind === "cloud")).toBe(false);
    const cloud = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, ichimoku: true } }).items.find((i) => i.kind === "cloud");
    expect(cloud && cloud.kind === "cloud" && cloud.points[cloud.points.length - 1].k).toBe(119 + 26);
  });
});
