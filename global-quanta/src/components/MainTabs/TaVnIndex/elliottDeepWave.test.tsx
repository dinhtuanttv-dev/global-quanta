import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import ElliottWavePanel, { ElliottDeepPanel } from "./ElliottWavePanel";
import { elliottMtf } from "../../../lib/quant-core/elliott/mtf";
import { elliottState, type ElliottState } from "../../../lib/quant-core/elliott";
import { elliottProjection } from "../../../lib/quant-core/elliott/projection";
import { buildScene } from "../../../lib/ta-command-center/chart/buildScene";
import { elliottFibItems, elliottProjectionItems, shortFib } from "../../../lib/ta-command-center/chart/elliottScene";
import { DEFAULT_LAYER_STATE } from "../../../lib/ta-command-center/LayerManager";
import { EMPTY_SMC } from "../../../lib/ta-command-center/AnalysisController";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
function render(ui: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
  return el;
}

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 + (i % 9) * 50 }; });
}
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
// 5 sóng tăng + A, B đã xác nhận -> đang ở sóng C (cùng mẫu với elliottE5.test.tsx)
const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const series = () => [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];

/** Trạng thái giả "sóng 5 tăng đang hình thành" với số liệu biết trước (kiểm tra số học của đường kịch bản). */
function forming5(): ElliottState {
  const pt = (i: number, price: number, type: "H" | "L") => ({ i, time: day(i), type, price, confirmed: true, ci: i + 3 });
  const points = [pt(0, 100, "L"), pt(20, 120, "H"), pt(30, 110, "L"), pt(55, 145, "H"), pt(65, 133, "L")];
  return {
    label: "Sóng 5 (tăng) đang hình thành", wave: "5", dir: "up", degree: "bậc trung", weight: 0.6, alternatives: [],
    scenario: { dir: "up", status: "wave5-forming", points, valid: true, violations: [], ratios: { w2: 0.5, w3: 1.75, w4: 0.34 }, score: 1, checks: {},
      targets: { wave5: { mode: "w5Over", levels: [{ ratio: 0.618, price: 136.4 }, { ratio: 1, price: 153 }, { ratio: 1.618, price: 165.4 }], window03: { low: 160.7, high: 178 } } } },
    invalidation: { price: 133, side: "below", reason: "" }, levels: [], pivots: points, asOf: day(70), barCount: 71,
  } as ElliottState;
}

describe("DW3 — đường kịch bản minh hoạ", () => {
  it("sóng 5 đang chạy: chặng 5 tới mức Fibonacci ĐẦU TIÊN còn phía trước giá (bỏ mức đã vượt), rồi A về cực trị sóng 4", () => {
    const pr = elliottProjection(forming5(), 140)!;
    expect(pr.legs.map((l) => l.label)).toEqual(["5", "A"]);
    expect(pr.legs[0].price).toBe(153);          // 136,4 đã nằm dưới giá 140 -> mức kế tiếp ×1
    expect(pr.legs[1].price).toBe(133);          // cực trị sóng 4 (T-19)
    // thời gian: sóng 5 ≈ sóng 1 (20 nến) trừ 5 nến đã chạy từ sóng 4 = 15; A ≈ sóng 4 (10 nến)
    expect(pr.legs[0].k).toBe(15); expect(pr.legs[1].k).toBe(25);
    expect(pr.basis).toHaveLength(2);
    expect(pr.from).toBe(day(70)); expect(pr.fromPrice).toBe(140);
  });

  it("giá đã vượt mọi mục tiêu sóng 5 -> chỉ còn chặng A; không có hướng / không có cấu trúc -> null", () => {
    expect(elliottProjection(forming5(), 170)!.legs.map((l) => l.label)).toEqual(["A"]);
    expect(elliottProjection({ ...forming5(), dir: null }, 140)).toBeNull();
    expect(elliottProjection({ ...forming5(), scenario: null, wave: "none" }, 140)).toBeNull();
    expect(elliottProjection(null, 140)).toBeNull();
  });

  it("engine thật — đang sóng C sau 5 sóng tăng: chặng C đi XUỐNG dưới giá hiện tại, k tăng dần, kết quả tất định", () => {
    const b = series(), st = elliottState(b)!;
    expect(st.wave).toBe("C");
    const pr = elliottProjection(st, b[b.length - 1].close)!;
    expect(pr.legs[0].label).toBe("C");
    expect(pr.legs[0].price).toBeLessThan(b[b.length - 1].close);
    for (let j = 1; j < pr.legs.length; j++) expect(pr.legs[j].k).toBeGreaterThan(pr.legs[j - 1].k);
    expect(elliottProjection(elliottState(b)!, b[b.length - 1].close)).toEqual(pr);
  });

  it("chỉ vẽ khi kết quả khớp nến cuối của khung đang xem (không vẽ đường cũ lên dữ liệu mới)", () => {
    const b = series(), st = elliottState(b)!;
    const items = elliottProjectionItems(st, b);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.kind === "future" && it.from).toBe(b[b.length - 1].date);
    expect(elliottProjectionItems(st, [...b, { ...b[b.length - 1], date: day(400) }])).toHaveLength(0);
  });
});

describe("DW2 — thang Fibonacci", () => {
  it("nhãn gọn trên biểu đồ", () => {
    expect(shortFib("Mục tiêu sóng 5 ×1,618")).toBe("S5 ×1,618");
    expect(shortFib("Mục tiêu sóng 3 ×2,618 sóng 1")).toBe("S3 ×2,618");
    expect(shortFib("Mục tiêu sóng C ×1 sóng A")).toBe("C ×1");
    expect(shortFib("Hồi 38,2% của 0→5")).toBe("38,2%");
    expect(shortFib("Cửa sổ sóng 5 (sách): 62% của 0→3")).toBe("Cửa sổ S5 62%");
    expect(shortFib("Mục tiêu đầu tiên của điều chỉnh (đáy/đỉnh sóng 4)")).toBe("Sóng 4");
    expect(shortFib("Vùng sóng 4 tương lai 0,382")).toBe("S4 0,382");
  });

  it("mức ngang có nhãn 'tỷ lệ · giá', neo vào một nến thật, không trùng giá", () => {
    const b = series(), st = elliottState(b)!;
    const dates = new Set(b.map((x) => x.date));
    const items = elliottFibItems(st, b);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const prices = items.map((x) => (x.kind === "hline" ? x.price : NaN));
    expect(new Set(prices.map((p) => Math.round(p * 100))).size).toBe(prices.length);
    for (const it of items) { expect(it.kind).toBe("hline"); if (it.kind === "hline") { expect(dates.has(it.t1)).toBe(true); expect(it.label?.text).toMatch(/ · \d/); } }
    expect(items.some((x) => x.kind === "hline" && /^C ×/.test(x.label?.text ?? ""))).toBe(true);
  });
});

describe("DW — lớp mặc định TẮT, bật độc lập", () => {
  it("elliottFib / elliottProj mặc định false; bật riêng từng lớp chỉ thêm phần của lớp đó", () => {
    expect(DEFAULT_LAYER_STATE.elliottFib).toBe(false);
    expect(DEFAULT_LAYER_STATE.elliottProj).toBe(false);
    const b = series(), st = elliottState(b)!;
    const base = { bars: b, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, elliott: { primary: st } };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items).toHaveLength(0);
    const fib = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, elliottFib: true } }).items;
    expect(fib.length).toBeGreaterThan(0); expect(fib.every((x) => x.kind === "hline")).toBe(true);
    const proj = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, elliottProj: true } }).items;
    expect(proj.length).toBeGreaterThan(0); expect(proj.every((x) => x.kind === "future")).toBe(true);
    // Lớp đếm sóng cũ (E5) không đổi khi chỉ bật elliottAuto.
    const auto = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, elliottAuto: true } }).items;
    expect(auto.some((x) => x.kind === "future")).toBe(false);
  });
});

describe("DW1 — chọn cách đếm", () => {
  it("elliottState trả phương án xếp sau dưới dạng trạng thái đầy đủ; kịch bản chính không đổi", () => {
    const b = series(), st = elliottState(b)!;
    expect(st.alternates?.length ?? 0).toBe(st.alternatives.length);
    st.alternates?.forEach((a, k) => { expect(a.label).toBe(st.alternatives[k].label); expect(a.scenario).not.toBe(st.scenario); expect(a.alternates).toBeUndefined(); });
  });

  it("panel: nút chọn cách đếm (khi có ≥ 2) + nút Fibonacci / Kịch bản; bật Kịch bản thì hiện căn cứ và ghi chú minh hoạ", () => {
    const b = series(), mtf = elliottMtf(b);
    const picks: number[] = [];
    const el = render(<ElliottWavePanel mtf={mtf} timeframe="D" autoOn={false} oscOn={false} onToggleAuto={() => {}} onToggleOsc={() => {}} onSuggest={() => {}}
      detailOpen={false} onToggleDetail={() => {}} fibOn={false} projOn onToggleFib={() => {}} onToggleProj={() => {}} pick={0} onPick={(k) => picks.push(k)} lastClose={b[b.length - 1].close} />);
    expect(el.querySelector("[data-testid=elliott-toggle-fib]")).not.toBeNull();
    expect(el.querySelector("[data-testid=elliott-toggle-proj]")!.getAttribute("aria-pressed")).toBe("true");
    expect(el.querySelector("[data-testid=elliott-projection-basis]")!.textContent).toMatch(/không phải dự báo/);
    const n = 1 + (mtf.day?.alternates?.length ?? 0);
    expect(el.querySelectorAll("[data-testid^=elliott-pick-]").length).toBe(n >= 2 ? n : 0);
    if (n >= 2) { act(() => (el.querySelector("[data-testid=elliott-pick-1]") as HTMLButtonElement).click()); expect(picks).toEqual([1]); }
  });
});

describe("DW4 — hiển thị mô hình", () => {
  it("thẻ có chip mô hình; phác đồ chi tiết có bảng quy tắc [cứng]/[mềm] + kết quả kiểm định", () => {
    const b = series(), mtf = elliottMtf(b);
    const card = render(<ElliottWavePanel mtf={mtf} timeframe="D" autoOn={false} oscOn={false} onToggleAuto={() => {}} onToggleOsc={() => {}} onSuggest={() => {}} detailOpen={false} onToggleDetail={() => {}} />);
    expect(card.querySelector("[data-testid=elliott-pattern-chips]")!.textContent).toMatch(/IM/);
    act(() => root?.unmount()); root = null;
    const deep = render(<ElliottDeepPanel mtf={mtf} daily={b} weekly={[]} ticker="TEST" onClose={() => {}} />);
    const rules = deep.querySelector("[data-testid=elliott-pattern-rules]")!;
    expect(rules.textContent).toMatch(/\[cứng\]/);
    expect(rules.textContent).toMatch(/KHÔNG ĐẠT/);
  });
});
