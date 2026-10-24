// Super Chart SC1–SC4 — kiểm các phần thuần: mô hình bố cục, preset, khoảng nhìn, lịch sử hình vẽ (undo/redo 50), sửa / dời hình,
// chọn hình (hit-test), tìm lệnh không dấu, store bố cục (lưu máy + đọc lại).
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_WORKSPACE, PRESETS, fullLayers, layersToSave, matchPreset, presetLayers, rangeBars, rangesFor, sanitizeWorkspace } from "./workspaceModel";
import { DEFAULT_LAYER_STATE, LayerManager, type LayerState } from "../../../../lib/ta-command-center/LayerManager";
import { DrawingManager, HISTORY_LIMIT, shiftPrimitive, type Trendline } from "../../../../lib/ta-command-center/DrawingManager";
import { distToSegment, hitTest, primitiveLabel } from "../../../../lib/ta-command-center/chart/drawingHit";
import { scoreCommand } from "./CommandPalette";
import { workspaceStore } from "./workspaceStore";

const L = (on: Partial<LayerState>): LayerState => ({ ...DEFAULT_LAYER_STATE, ...on });

describe("mô hình bố cục", () => {
  it("sanitize: dữ liệu lạ / sai kiểu -> mặc định; giữ lớp hợp lệ; kẹp chiều cao dock", () => {
    expect(sanitizeWorkspace(null)).toEqual(DEFAULT_WORKSPACE);
    const w = sanitizeWorkspace({ preset: "momentum", layers: { volume: true, nope: true, rsi: "x" }, dockHeight: 5, dockTab: "zzz", paneStretch: { rsi: 0.2, price: 0.5, volume: 7 }, mine: { smc: true } });
    expect(w.preset).toBe("momentum");
    expect(w.layers).toEqual({ volume: true });
    expect(w.dockHeight).toBe(160);
    expect(w.dockTab).toBe(DEFAULT_WORKSPACE.dockTab);
    expect(w.paneStretch).toEqual({ rsi: 0.2 });
    expect(w.mine).toEqual({ smc: true });
  });

  it("preset chỉ đổi lớp: mọi lớp khác tắt, Confluence giữ nguyên; matchPreset nhận lại đúng preset", () => {
    const mom = PRESETS.find((p) => p.id === "momentum")!;
    const next = presetLayers(mom, L({ smc: true, aiDetectionMaster: true }));
    expect(next.volume && next.rsi).toBe(true);
    expect(next.smc).toBe(false);
    expect(next.aiDetectionMaster).toBe(true);
    expect(matchPreset(L(next))).toBe("momentum");
    expect(matchPreset(L({}))).toBe("clean");
    expect(matchPreset(L({ smc: true, vsa: true }))).toBe("custom");
    expect(matchPreset(L({ smc: true, vsa: true }), { smc: true, vsa: true })).toBe("mine");
    expect(PRESETS.map((p) => p.id)).toEqual(["clean", "priceVolume", "structure", "momentum", "elliott", "manual"]);
  });

  it("lưu lớp: chỉ lớp đang bật; khôi phục -> trạng thái đầy đủ (lớp không lưu thì tắt)", () => {
    expect(layersToSave(L({ rsi: true }))).toEqual({ rsi: true });
    const full = fullLayers({ rsi: true }, L({ smc: true }));
    expect(full.rsi).toBe(true);
    expect(full.smc).toBe(false);
    const lm = new LayerManager();
    let events = 0;
    lm.on(() => events++);
    lm.setMany(full);
    expect(lm.getState().rsi).toBe(true);
    expect(events).toBe(1);
    lm.setMany(full);
    expect(events).toBe(1); // không đổi -> không phát sự kiện
  });

  it("khoảng nhìn theo khung: D = phiên, W = tuần, intraday = số nến mỗi phiên", () => {
    expect(rangesFor("D").map((r) => r.id)).toEqual(["1T", "3T", "6T", "1N", "3N", "all"]);
    expect(rangeBars("D", "1N")).toBe(250);
    expect(rangeBars("W", "1N")).toBe(50);
    expect(rangeBars("1H", "5P")).toBe(25);
    expect(rangeBars("5m", "1P")).toBe(51);
    expect(rangeBars("D", "all")).toBe(Infinity);
  });
});

describe("hình vẽ chuyên nghiệp (SC3)", () => {
  const pt = (date: string, price: number) => ({ date, price });
  const draw = (m: DrawingManager, a = pt("2026-01-05", 10), b = pt("2026-01-20", 12)) => { m.startDraw("trendline", a); return m.finishDraw(b)!; };

  it("hoàn tác / làm lại: tạo · sửa · xoá · xoá tất cả; nạp hình mã khác xoá lịch sử", () => {
    const m = new DrawingManager();
    const t = draw(m);
    m.updatePrimitive(t.id, { name: "Kênh" });
    m.deletePrimitive(t.id);
    expect(m.getPrimitives()).toHaveLength(0);
    expect(m.undo()).toBe(true); expect(m.getPrimitives()[0].name).toBe("Kênh");
    expect(m.undo()).toBe(true); expect(m.getPrimitives()[0].name).toBeUndefined();
    expect(m.redo()).toBe(true); expect(m.getPrimitives()[0].name).toBe("Kênh");
    m.clearAll(); expect(m.getPrimitives()).toHaveLength(0);
    m.undo(); expect(m.getPrimitives()).toHaveLength(1);
    m.replaceAll([]); expect(m.canUndo()).toBe(false);
  });

  it(`lịch sử giới hạn ${HISTORY_LIMIT} bước; hình khoá không sửa được điểm neo nhưng đổi được tên`, () => {
    const m = new DrawingManager();
    for (let k = 0; k < 60; k++) draw(m, pt("2026-01-05", 10 + k), pt("2026-01-20", 20 + k));
    let n = 0; while (m.undo()) n++;
    expect(n).toBe(HISTORY_LIMIT);
    const m2 = new DrawingManager();
    const t = draw(m2);
    m2.updatePrimitive(t.id, { locked: true });
    expect(m2.updatePrimitive(t.id, { p1: pt("2026-01-06", 11) })).toBe(false);
    expect(m2.updatePrimitive(t.id, { name: "Đỉnh" })).toBe(true);
  });

  it("Fibonacci: kéo điểm neo -> tự tính lại các mức (giữ chế độ mở rộng)", () => {
    const m = new DrawingManager();
    m.setFibExtensionMode(true);
    m.startDraw("fibonacci", pt("2026-01-05", 10));
    const f = m.finishDraw(pt("2026-01-20", 20))!;
    m.updatePrimitive(f.id, { p2: pt("2026-01-20", 30) });
    const g = m.getPrimitives()[0] as typeof f & { levels: { ratio: number; price: number }[] };
    expect(g.levels.find((l) => l.ratio === 0)!.price).toBe(30);
    expect(g.levels.length).toBe(10);
  });

  it("dời cả hình theo số nến + giá; kẹp trong dữ liệu", () => {
    const dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
    const t: Trendline = { id: "a", toolType: "trendline", p1: pt("2026-01-05", 10), p2: pt("2026-01-07", 12), createdAt: 1 };
    expect(shiftPrimitive(t, 1, 0.5, dates)).toEqual({ p1: pt("2026-01-06", 10.5), p2: pt("2026-01-08", 12.5) });
    expect(shiftPrimitive(t, 9, 0, dates).p2!.date).toBe("2026-01-08");
  });

  it("hit-test: ưu tiên điểm neo, rồi thân; hình ẩn không chọn được; nhãn mặc định", () => {
    const proj = (q: { date: string; price: number }) => ({ x: Number(q.date.slice(-2)) * 10, y: 200 - q.price * 10 });
    const t: Trendline = { id: "t", toolType: "trendline", p1: pt("2026-01-05", 10), p2: pt("2026-01-15", 15), createdAt: 1 };
    expect(hitTest([t], { x: 50, y: 100 }, proj)?.part).toBe("p1");
    expect(hitTest([t], { x: 100, y: 76 }, proj)?.part).toBe("body");
    expect(hitTest([t], { x: 100, y: 20 }, proj)).toBeNull();
    expect(hitTest([{ ...t, hidden: true }], { x: 50, y: 100 }, proj)).toBeNull();
    expect(distToSegment({ x: 0, y: 5 }, { x: -10, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(primitiveLabel(t)).toBe("Trendline · 2026-01-05");
    expect(primitiveLabel({ ...t, name: "Kênh" })).toBe("Kênh");
  });
});

describe("bảng lệnh + store bố cục", () => {
  it("tìm lệnh không dấu, mọi từ phải khớp", () => {
    expect(scoreCommand({ label: "Bật Khối lượng", group: "Pane chỉ báo" }, "khoi luong")).toBeGreaterThan(0);
    expect(scoreCommand({ label: "Bật Khối lượng", group: "Pane chỉ báo" }, "khoi rsi")).toBe(0);
    expect(scoreCommand({ label: "Fibonacci", group: "Vẽ" }, "fib")).toBeGreaterThan(scoreCommand({ label: "Fibonacci", group: "Vẽ" }, "bon"));
  });

  beforeEach(() => { try { localStorage.clear(); } catch { /* môi trường node */ } workspaceStore.reset(); });
  it("cập nhật -> snapshot mới + lưu máy; dữ liệu sai bị làm sạch", () => {
    const seen: unknown[] = [];
    const off = workspaceStore.subscribe(() => seen.push(workspaceStore.getSnapshot()));
    workspaceStore.update({ dockTab: "elliott", dockHeight: 99999 });
    expect(workspaceStore.getSnapshot().dockTab).toBe("elliott");
    expect(workspaceStore.getSnapshot().dockHeight).toBe(1200);
    workspaceStore.update({ dockTab: "elliott" });
    expect(seen).toHaveLength(1); // không đổi -> không phát
    if (typeof localStorage !== "undefined") expect(JSON.parse(localStorage.getItem("gq.ta.workspace.v1")!).ws.dockTab).toBe("elliott");
    off();
  });
});

describe("R1 — khối ngoại: 0 là cân bằng; lý do không vẽ được pane", async () => {
  const { foreignUnavailable } = await import("../TVChartPanel");
  const { foreignStats } = await import("../OrderFlowPanel");
  it("chỉ số / intraday / chưa có dữ liệu -> có lý do; cổ phiếu D có dữ liệu -> null", () => {
    expect(foreignUnavailable("VNINDEX", "D", true, 0)).toMatch(/chỉ số/);
    expect(foreignUnavailable("FPT", "15m", true, 200)).toMatch(/D \/ W \/ M/);
    expect(foreignUnavailable("FPT", "D", true, 0)).toMatch(/chưa có dữ liệu/);
    expect(foreignUnavailable("FPT", "D", false, 0)).toBeNull();
    expect(foreignUnavailable("FPT", "W", true, 250)).toBeNull();
  });
  it("phiên cuối ròng 0 -> chuỗi 0 (không tính là mua ròng)", () => {
    const d = (date: string, netVal: number) => ({ date, buyVal: 0, sellVal: 0, netVal, room: null });
    expect(foreignStats([d("a", 5), d("b", 3), d("c", 0)])!.streak).toBe(0);
    expect(foreignStats([d("a", -1), d("b", 3), d("c", 2)])!.streak).toBe(2);
  });
});

describe("R2 — CVD divergence vẽ tại nến xác nhận", async () => {
  const { divergenceMarkers } = await import("../TVChartPanel");
  const bars = Array.from({ length: 10 }, (_, i) => ({ date: `2026-02-${String(i + 1).padStart(2, "0")}`, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
  it("marker chính 'Div · sau N nến' ở nến xác nhận + chấm mờ không chữ ở đỉnh/đáy gốc", () => {
    const m = divergenceMarkers([{ date: bars[3].date, dir: "bearish", confirmedIndex: 6 }], bars);
    expect(m).toEqual([
      expect.objectContaining({ time: bars[3].date, text: "", shape: "circle" }),
      expect.objectContaining({ time: bars[6].date, text: "Div · sau 3 nến", shape: "arrowDown" }),
    ]);
    expect(divergenceMarkers([{ date: bars[3].date, dir: "bullish", confirmedIndex: 3 }], bars)).toEqual([expect.objectContaining({ time: bars[3].date, text: "Div" })]);
  });
});
