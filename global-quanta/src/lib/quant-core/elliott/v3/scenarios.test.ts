import { describe, expect, it } from "vitest";
import { EP2_PREREG, evaluateLifecycle, randomWalkHitProb, scenarioFromNode, scenariosFromTree, scoreLedger, triggerAt, type EwScenario } from "./scenarios";
import { buildWaveTree, type TreePivot, type WaveNode } from "./waveTree";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const bar = (i: number, close: number, high = close, low = close) => ({ time: day(i), open: close, high, low, close, volume: 1 });
const sc = (over: Partial<EwScenario> = {}): EwScenario => ({
  id: "X|wave3|1|a", template: "wave3", role: "primary", level: 1, dir: 1, title: "Sóng 3", anchors: [], createdAt: day(0), provisional: false,
  trigger: { price: 110, line: null, text: "" }, targets: [{ price: 130, label: "MT1" }, { price: 150, label: "MT2" }],
  invalidation: { price: 100, text: "" }, expiry: { waitBars: 5, runBars: 10 }, ...over,
});

describe("EP2 — vòng đời kịch bản", () => {
  it("chờ -> kích hoạt (theo GIÁ ĐÓNG CỬA) -> mục tiêu 1 -> mục tiêu 2", () => {
    const c = [bar(0, 105), bar(1, 108, 112, 106), bar(2, 112), bar(3, 125, 131, 120), bar(4, 140), bar(5, 151, 152, 145)];
    const lc = evaluateLifecycle(sc(), c);
    expect(lc.events.map((e) => `${e.type}@${e.time}`)).toEqual([`triggered@${day(2)}`, `target1@${day(3)}`, `target2@${day(5)}`]);
    expect(lc.state).toBe("target2"); expect(lc.triggerPrice).toBe(112);
  });
  it("high vượt mốc nhưng đóng cửa không vượt -> CHƯA kích hoạt; vô hiệu trước kích hoạt", () => {
    const lc = evaluateLifecycle(sc(), [bar(0, 105), bar(1, 108, 115, 104), bar(2, 101, 103, 99)]);
    expect(lc.events.map((e) => e.type)).toEqual(["invalidated"]);
  });
  it("cùng nến chạm mục tiêu và vô hiệu -> tính VÔ HIỆU (thận trọng)", () => {
    const lc = evaluateLifecycle(sc(), [bar(0, 105), bar(1, 112), bar(2, 115, 131, 99)]);
    expect(lc.events.map((e) => e.type)).toEqual(["triggered", "invalidated"]);
  });
  it("hết hạn khi chờ quá lâu / chạy quá lâu chưa tới mục tiêu", () => {
    expect(evaluateLifecycle(sc(), Array.from({ length: 9 }, (_, i) => bar(i, 105))).state).toBe("expired");
    expect(evaluateLifecycle(sc(), [bar(0, 105), bar(1, 112), ...Array.from({ length: 14 }, (_, i) => bar(i + 2, 115))]).state).toBe("expired");
  });
  it("kịch bản giảm (dir = −1): đối xứng", () => {
    const d = sc({ dir: -1, trigger: { price: 90, line: null, text: "" }, targets: [{ price: 70, label: "" }, { price: 50, label: "" }], invalidation: { price: 100, text: "" } });
    expect(evaluateLifecycle(d, [bar(0, 95), bar(1, 88), bar(2, 72, 80, 69)]).events.map((e) => e.type)).toEqual(["triggered", "target1"]);
  });
  it("KHÔNG NHÌN TRƯỚC: bỏ qua nến ≤ thời điểm tạo; thêm nến tương lai không đổi sự kiện đã có", () => {
    const c = [bar(0, 200), bar(1, 112), bar(2, 131), bar(3, 140)];
    const lc = evaluateLifecycle(sc({ createdAt: day(1) }), c);       // nến 1 (đóng 112) nằm TRƯỚC khi kịch bản tồn tại
    expect(lc.events[0]).toEqual({ type: "triggered", time: day(2), price: 131 });
    const more = evaluateLifecycle(sc({ createdAt: day(1) }), [...c, bar(4, 90, 95, 89)]);
    expect(more.events.slice(0, 2)).toEqual(lc.events.slice(0, 2));
    expect(evaluateLifecycle(sc({ createdAt: null }), c).state).toBe("waiting");   // tạm (pivot chưa xác nhận): chưa theo dõi
  });
  it("kích hoạt theo ĐƯỜNG B–D (tam giác) nội suy theo chỉ số nến", () => {
    const c = Array.from({ length: 10 }, (_, i) => bar(i, 100));
    const t = sc({ trigger: { price: 0, line: { a: { time: day(2), price: 120 }, b: { time: day(6), price: 112 } }, text: "" } });
    expect(triggerAt(t, c, 2)).toBe(120); expect(triggerAt(t, c, 6)).toBe(112); expect(triggerAt(t, c, 8)).toBe(108);
  });
});

describe("EP2 — chuẩn ngẫu nhiên & chấm điểm (đăng ký trước)", () => {
  it("người đánh bạc phá sản: p = |x−S| / (|x−T| + |x−S|)", () => {
    expect(randomWalkHitProb(100, 120, 90)).toBeCloseTo(10 / 30);
    expect(randomWalkHitProb(100, 110, 90)).toBeCloseTo(0.5);
  });
  it("z = (đạt − Σp) / √Σp(1−p); chưa đủ 100 mẫu thì không ĐẠT dù z cao", () => {
    const rows = Array.from({ length: 50 }, (_, k) => ({ triggerPrice: 100, target1: 110, invalidation: 90, outcome: (k < 40 ? "hit" : "miss") as "hit" | "miss" }));
    const r = scoreLedger(rows);
    expect(r.n).toBe(50); expect(r.expected).toBeCloseTo(25); expect(r.z).toBeCloseTo((40 - 25) / Math.sqrt(12.5));
    expect(r.pass).toBe(false);
    expect(scoreLedger([...rows, ...rows]).pass).toBe(true);
    expect(scoreLedger([{ triggerPrice: null, target1: 1, invalidation: 0, outcome: null }]).n).toBe(0);
    expect(EP2_PREREG.minN).toBe(100); expect(EP2_PREREG.zPass).toBe(1.96);
  });
});

const piv = (i: number, price: number, type: "H" | "L", ci: number | null = i + 2): TreePivot => ({ i, price, time: day(i), type, confirmed: ci != null, ci });
const leg = (a: TreePivot, b: TreePivot): WaveNode => ({ level: 0, kind: "leg", pattern: null, complete: true, provisional: false, dir: b.price >= a.price ? 1 : -1, start: a, end: b, children: [], childLabels: [], sig: 1, score: 0, fit: null });
const node = (kind: "motive" | "corrective", pattern: WaveNode["pattern"], ps: TreePivot[], complete: boolean, labels: string[]): WaveNode => {
  const children = ps.slice(1).map((p, k) => leg(ps[k], p));
  return { level: 1, kind, pattern, complete, provisional: false, dir: ps[ps.length - 1].price >= ps[0].price ? 1 : -1, start: ps[0], end: ps[ps.length - 1], children, childLabels: labels, sig: 5, score: 1, fit: null };
};

describe("EP2 — mẫu kịch bản theo cấu trúc", () => {
  it("xung lực 1-2 -> sóng 3: kích hoạt > đỉnh 1; MT 161,8% / 261,8% sóng 1 từ đáy 2; vô hiệu < đáy 2", () => {
    const s = scenarioFromNode(node("motive", "IM", [piv(0, 100, "L"), piv(10, 120, "H"), piv(20, 110, "L")], false, ["i", "ii"]), null, "primary", "X")!;
    expect(s.template).toBe("wave3"); expect(s.dir).toBe(1);
    expect(s.trigger.price).toBe(120); expect(s.targets.map((t) => t.price)).toEqual([110 + 1.618 * 20, 110 + 2.618 * 20]);
    expect(s.invalidation.price).toBe(110);
  });
  it("5 sóng xong -> điều chỉnh: kích hoạt < cuối sóng 4; MT hồi 38,2 / 61,8% của 0→5; vô hiệu > đỉnh 5", () => {
    const s = scenarioFromNode(node("motive", "IM", [piv(0, 100, "L"), piv(10, 120, "H"), piv(20, 110, "L"), piv(40, 150, "H"), piv(50, 140, "L"), piv(60, 160, "H")], true, ["1", "2", "3", "4", "5"]), null, "primary")!;
    expect(s.template).toBe("afterImpulse"); expect(s.dir).toBe(-1); expect(s.trigger.price).toBe(140);
    expect(s.targets[0].price).toBeCloseTo(160 - 0.382 * 60); expect(s.invalidation.price).toBe(160);
  });
  it("flat mở rộng xong: mục tiêu nằm sau mốc kích hoạt -> đo lại từ kích hoạt; mốc vô hiệu sai phía -> bỏ", () => {
    // A lên 100->110, B xuống 96 (vượt điểm đầu A), C lên 116: kích hoạt < 96; MT 100% A (10) đo từ C = 106 nằm SAU kích hoạt
    const s = scenarioFromNode(node("corrective", "EX-FL", [piv(0, 100, "L"), piv(10, 110, "H"), piv(20, 96, "L"), piv(30, 116, "H")], true, ["A", "B", "C"]), null, "primary")!;
    expect(s.template).toBe("afterCorrection"); expect(s.dir).toBe(-1);
    expect(s.targets[0].price).toBe(96 - 10); expect(s.targets[0].label).toMatch(/đo từ kích hoạt/);
  });
  it("kịch bản 'tạm' khi pivot cuối chưa xác nhận; id ổn định theo mã + mẫu + bậc + điểm neo", () => {
    const n = node("motive", "IM", [piv(0, 100, "L"), piv(10, 120, "H"), piv(20, 110, "L", null)], false, ["i", "ii"]);
    const s = scenarioFromNode(n, null, "primary", "FPT")!;
    expect(s.provisional).toBe(true);
    expect(s.id).toBe(`FPT|wave3|1|${day(0)},${day(10)},${day(20)}`);
  });
});

describe("EP2 — tích hợp với cây v3", () => {
  it("cây thật -> có kịch bản chính, tất định, mục tiêu phía trước / vô hiệu phía sau mốc kích hoạt", () => {
    let x = 100, seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const c = Array.from({ length: 600 }, (_, i) => { x *= 1 + (rnd() - 0.48) * 0.05; return { time: day(i), open: x, high: x * 1.01, low: x * 0.99, close: x, volume: 1 }; });
    const a = scenariosFromTree(buildWaveTree(c), c, "SIM"), b = scenariosFromTree(buildWaveTree(c), c, "SIM");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const s of a) {
      expect(s.dir * (s.targets[0].price - s.trigger.price)).toBeGreaterThan(0);
      expect(s.dir * (s.invalidation.price - s.trigger.price)).toBeLessThan(0);
      if (!s.provisional) expect(s.createdAt).not.toBeNull();
    }
  });
});
