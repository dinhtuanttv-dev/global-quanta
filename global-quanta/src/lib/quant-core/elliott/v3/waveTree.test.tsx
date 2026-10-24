import { describe, expect, it } from "vitest";
import { buildWaveTree, describePosition, extremesOk, treeCovers, waveLabel, WINDOW_ANCHOR, type WaveNode } from "./waveTree";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
/** Nến từ các điểm gãy (chỉ số nến, giá), nội suy tuyến tính; high/low ±0,15%. */
function candlesFrom(points: [number, number][]) {
  const out = [];
  for (let k = 1; k < points.length; k++) {
    const [i0, p0] = points[k - 1], [i1, p1] = points[k];
    for (let i = i0; i < i1; i++) { const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); out.push({ time: day(i), open: c, high: c * 1.0015, low: c * 0.9985, close: c, volume: 1000 }); }
  }
  const [iL, pL] = points[points.length - 1];
  out.push({ time: day(iL), open: pL, high: pL * 1.0015, low: pL * 0.9985, close: pL, volume: 1000 });
  return out;
}
/** Chia một sóng đẩy thành 5 sóng con / sóng điều chỉnh thành zigzag 3 sóng con (mỗi sóng con 6 nến). */
function subdivide(from: number, to: number, motive: boolean): number[] {
  const d = to - from;
  const fr = motive ? [0.4, -0.15, 0.6, -0.15, 0.3] : [0.6, -0.3, 0.7];
  const out: number[] = []; let p = from;
  for (const f of fr) { p += f * d; out.push(p); }
  out[out.length - 1] = to;
  return out;
}
/** Xung lực sách giáo khoa: 100 → 130 → 115 → 175 → 160 → 195, mỗi sóng chia nhỏ đúng ngữ pháp; thêm `tail` điểm. */
function textbook(tail: number[] = []): [number, number][] {
  const macro = [100, 130, 115, 175, 160, 195];
  const pts: [number, number][] = [[0, 100]];
  let i = 0;
  for (let k = 1; k < macro.length; k++) for (const p of subdivide(macro[k - 1], macro[k], k % 2 === 1)) { i += 6; pts.push([i, p]); }
  for (const p of tail) { i += 6; pts.push([i, p]); }
  return pts;
}
const all = (t: NonNullable<ReturnType<typeof buildWaveTree>>) => t.levels.slice(1).flat();

describe("EP1 — cây sóng nhiều bậc", () => {
  it("dựng lại xung lực lồng bậc: một nút IM 5 con (đẩy-điều chỉnh-đẩy-điều chỉnh-đẩy) từ 100 tới 195; con là cấu trúc bậc dưới", () => {
    const tree = buildWaveTree(candlesFrom(textbook([180, 186, 170])), { basePct: 0.02 })!;
    const im = all(tree).find((n) => n.pattern === "IM" && n.children.length === 5 && Math.abs(n.start.price - 100) < 1 && Math.abs(n.end.price - 195) < 1);
    expect(im, describePosition(tree)).toBeDefined();
    expect(im!.children.map((c) => c.kind)).toEqual(["motive", "corrective", "motive", "corrective", "motive"]);
    expect(im!.childLabels).toEqual([1, 2, 3, 4, 5].map((k) => waveLabel(im!.level, k - 1, "IM")));
    expect(im!.complete).toBe(true);
  });
  it("mọi cấu trúc ở mọi bậc thoả quy tắc cực trị (nhất quán theo cấu trúc)", () => {
    const c = candlesFrom(textbook([180, 186, 170]));
    const tree = buildWaveTree(c, { basePct: 0.02 })!;
    const w = c.slice(c.length - tree.barCount);
    for (const n of all(tree).filter((x: WaveNode) => x.kind !== "orphan")) expect(extremesOk(w, [n.children[0].start, ...n.children.map((x) => x.end)])).toBe(true);
  });
  it("mép phải: sóng 3 của xung lực đang chạy -> vị trí 'đang chạy', được tính là có phủ", () => {
    const pts = textbook().slice(0, 11); // tới giữa sóng 3 lớn
    const tree = buildWaveTree(candlesFrom(pts), { basePct: 0.02 })!;
    expect(treeCovers(tree)).toBe(true);
    expect(tree.position.some((n) => !n.complete && (n.kind === "motive" || n.kind === "corrective"))).toBe(true);
    expect(describePosition(tree)).toMatch(/đang chạy/);
  });
  it("tất định + không nhìn trước: cùng dữ liệu cùng kết quả; cấu trúc dùng pivot chưa xác nhận bị gắn 'tạm'", () => {
    const c = candlesFrom(textbook([180, 186]));
    const a = buildWaveTree(c, { basePct: 0.02 }), b = buildWaveTree(c, { basePct: 0.02 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const last = a!.levels[0][a!.levels[0].length - 1];
    expect(last.provisional).toBe(!last.end.confirmed);
  });
  it("chuỗi đi ngang nhiễu: không dựng xung lực giả; chưa đủ nến -> null", () => {
    const flat = Array.from({ length: 200 }, (_, i) => { const c = 100 + Math.sin(i * 1.7) * 0.2; return { time: day(i), open: c, high: c + 0.05, low: c - 0.05, close: c, volume: 1 }; });
    const t = buildWaveTree(flat, { basePct: 0.02 });
    expect(t === null || !all(t).some((n) => n.pattern === "IM")).toBe(true);
    expect(buildWaveTree(flat.slice(0, 30))).toBeNull();
  });
});

describe("EP1 — quy tắc & ký hiệu", () => {
  it("quy tắc cực trị theo vai trò: nến bao trùm (đỉnh pivot nội bộ, low thấp hơn đáy kế tiếp) không làm hỏng đáy", () => {
    const c = [100, 105, 104, 101, 102].map((p, i) => ({ time: day(i), open: p, high: p + 0.5, low: p - 0.5, close: p, volume: 1 }));
    c[2] = { ...c[2], high: 104.5, low: 99 };                                      // nến 2: đỉnh pivot nội bộ, low 99 < đáy 100,5 ở nến 3
    const pts = [{ i: 0, price: 99.5 }, { i: 1, price: 105.5 }, { i: 3, price: 100.5 }, { i: 4, price: 102.5 }];
    expect(extremesOk(c, pts, new Set(), new Set())).toBe(false);                   // không biết vai trò -> loại
    expect(extremesOk(c, pts, new Set([1, 2]), new Set([0, 3]))).toBe(true);        // nến 2 đã là ĐỈNH pivot -> bỏ qua low của nó
  });
  it("ký hiệu theo bậc: 1 = i…v / a b c; 2 = 1…5 / A B C; 3 = (1)…(5); W-X-Y", () => {
    expect([0, 1, 2, 3, 4].map((k) => waveLabel(1, k, "IM"))).toEqual(["i", "ii", "iii", "iv", "v"]);
    expect([0, 1, 2].map((k) => waveLabel(1, k, "ZZ"))).toEqual(["a", "b", "c"]);
    expect(waveLabel(2, 2, "IM")).toBe("3"); expect(waveLabel(2, 1, "FL")).toBe("B");
    expect(waveLabel(3, 4, "ED")).toBe("(5)"); expect(waveLabel(3, 0, "TR")).toBe("(A)");
    expect([0, 1, 2].map((k) => waveLabel(2, k, "D3"))).toEqual(["W", "X", "Y"]);
  });
  it("cửa sổ neo theo bội số 25 nến: thêm nến trong cùng khối 25 không đổi điểm bắt đầu cửa sổ", () => {
    let x = 100, seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const c = Array.from({ length: 700 }, (_, i) => { x *= 1 + (rnd() - 0.5) * 0.04; return { time: day(i), open: x, high: x * 1.01, low: x * 0.99, close: x, volume: 1 }; });
    const start = (n: number) => n - buildWaveTree(c.slice(0, n), { basePct: 0.03 })!.barCount;
    const s0 = start(650);
    for (const n of [651, 660, 674]) expect(start(n)).toBe(s0);
    expect(start(675)).toBe(s0 + WINDOW_ANCHOR);
  });
});

describe("EP1 — hiển thị trên thẻ Elliott", () => {
  it("dòng 'Elliott Pro v3' hiện vị trí + số liệu nghiệm thu", async () => {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { default: ElliottWavePanel } = await import("../../../../components/MainTabs/TaVnIndex/ElliottWavePanel");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const tree = buildWaveTree(candlesFrom(textbook([180, 186, 170])), { basePct: 0.02 });
    const el = document.createElement("div"); document.body.appendChild(el);
    const root = createRoot(el);
    const mtf = { week: null, day: null, relation: "unclear", relationText: "—", weekPivotsOnDaily: [], osc: { week: null, day: null } } as never;
    act(() => root.render(<ElliottWavePanel mtf={mtf} timeframe="D" autoOn={false} oscOn={false} onToggleAuto={() => {}} onToggleOsc={() => {}} onSuggest={() => {}} detailOpen={false} onToggleDetail={() => {}} tree={tree} />));
    const row = el.querySelector("[data-testid=elliott-v3-row]")!;
    expect(row.textContent).toMatch(/Elliott Pro v3/);
    expect(row.textContent).toMatch(/98,3%/);
    act(() => root.unmount()); el.remove();
  });
});
