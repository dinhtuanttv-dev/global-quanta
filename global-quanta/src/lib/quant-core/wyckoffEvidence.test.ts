import { describe, expect, it } from "vitest";
import { classifySpringBar, nextBarConfirmation, rangeLean, wyckoffEvidence, WYCKOFF_EVIDENCE_POLICY } from "./wyckoffEvidence";
import { classifyWyckoffV2 } from "./wyckoff";
import { analyze } from "./index";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";
import type { Bar } from "./math";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const V = 1_000_000;
/** Range phẳng 100–110 (40 nến, dao động đều, KL V) — nền để chèn các nến kiểm thử. */
function flatRange(n = 40): Bar[] {
  const out: Bar[] = [];
  for (let k = 0; k < n; k++) {
    const c = 105 + 4 * Math.sin((2 * Math.PI * k) / 10);
    out.push({ date: day(k), open: c - 0.3, high: c + 1, low: c - 1, close: c, volume: V });
  }
  return out;
}
const bar = (out: Bar[], o: number, h: number, l: number, c: number, v: number) => { out.push({ date: day(out.length), open: o, high: h, low: l, close: c, volume: v }); return out.length - 1; };

describe("Spring #1/#2/#3 (tr.45–46)", () => {
  it("#3: thủng nông, KL thấp -> đủ điều kiện ngay", () => {
    const b = flatRange();
    const k = bar(b, 101.5, 102, 100.6, 101.8, 0.6 * V); // đáy range ≈ 100; atr ≈ 2 -> thủng 0 ATR? đặt đáy dưới 100
    b[k].low = 99.6;
    const ci = k;
    const sp = classifySpringBar(b, k, ci, 100, "spring");
    expect(sp.kind).toBe(3);
    expect(sp.actionable).toBe(true);
  });

  it("#1: KL rất lớn -> chờ Test; Test KL thấp không thủng đáy -> đủ điều kiện, biết được ở nến Test", () => {
    const b = flatRange();
    const k = bar(b, 101, 101.2, 97, 100.5, 3 * V);
    for (let j = 0; j < 3; j++) bar(b, 101 + j, 103 + j, 100.5 + j, 102.5 + j, 0.9 * V);
    const t = bar(b, 102, 102.3, 98.5, 101.5, 0.5 * V); // về gần đáy, KL thấp, không thủng 97
    const sp = classifySpringBar(b, k, k, 100, "spring");
    expect(sp.kind).toBe(1);
    expect(sp.test?.index).toBe(t);
    expect(sp.actionable).toBe(true);
    expect(sp.knownIndex).toBe(t);
    // Nhân quả: trước nến Test chưa biết có Test.
    expect(classifySpringBar(b.slice(0, t), k, k, 100, "spring").test).toBeNull();
  });

  it("UT đối xứng: KL rất lớn vượt kháng cự -> UT #1", () => {
    const b = flatRange();
    const k = bar(b, 109, 113, 108.5, 109.5, 3 * V);
    expect(classifySpringBar(b, k, k, 110, "ut").kind).toBe(1);
  });
});

describe("Xác nhận bằng nến kế tiếp (Phần D)", () => {
  const sos = () => { const b = flatRange(); const k = bar(b, 109, 114, 108.8, 113.8, 2.5 * V); return { b, k }; };
  it("nến sau tăng tiếp đóng nửa trên -> xác nhận", () => {
    const { b, k } = sos();
    bar(b, 113.8, 115.5, 113.5, 115.2, 1.2 * V);
    expect(nextBarConfirmation(b, k, 1, "SOS").verdict).toBe("confirmed");
  });
  it("nến sau giảm biên rộng KL lớn đóng dưới giữa nến SOS -> không xác nhận", () => {
    const { b, k } = sos();
    bar(b, 113.8, 114, 108.5, 109, 2.5 * V);
    expect(nextBarConfirmation(b, k, 1, "SOS").verdict).toBe("rejected");
  });
  it("biên hẹp KL thấp giữ trên giữa nến SOS -> không có cung (xác nhận)", () => {
    const { b, k } = sos();
    bar(b, 113.6, 114, 113, 113.3, 0.5 * V);
    const c = nextBarConfirmation(b, k, 1, "SOS");
    expect(c.verdict).toBe("confirmed");
    expect(c.reason).toMatch(/No Supply/);
  });
  it("chưa có nến sau -> chờ", () => {
    const { b, k } = sos();
    expect(nextBarConfirmation(b, k, 1, "SOS").verdict).toBe("pending");
  });
});

describe("Creek · JAC · BUEC (tr.47–49)", () => {
  const build = (vol: number) => {
    const b = flatRange();
    const x = bar(b, 109.5, 115, 109.3, 114.8, vol);           // vượt các đỉnh hồi ~109
    bar(b, 114.8, 115.2, 112.5, 113, 0.9 * V);
    const bu = bar(b, 113, 113.2, 109.4, 110.6, 0.5 * V);       // lùi về Creek, KL thấp
    return { b, x, bu };
  };
  const range = { start: 0, end: 39, high: 110, low: 100 };
  it("vượt Creek với biên độ + KL lớn = JAC, lùi KL thấp = BUEC; có đường Creek để vẽ", () => {
    const { b, x, bu } = build(2.5 * V);
    const ev = wyckoffEvidence(b, range, []);
    const jac = ev.breaks.find((z) => z.kind === "JAC")!;
    expect(jac.index).toBe(x);
    expect(jac.backup?.index).toBe(bu);
    expect(ev.creek!.points.length).toBeGreaterThanOrEqual(2);
    // Nhân quả: cắt dữ liệu tại nến JAC vẫn thấy JAC ở cùng nến.
    expect(wyckoffEvidence(b.slice(0, x + 1), range, []).breaks.find((z) => z.kind === "JAC")?.index).toBe(x);
  });
  it("vượt Creek thiếu KL -> không phải JAC", () => {
    const { b } = build(0.8 * V);
    const ev = wyckoffEvidence(b, range, []);
    expect(ev.breaks.some((z) => z.kind === "JAC")).toBe(false);
    expect(ev.breaks.find((z) => z.kind === "creek-weak")?.note).toMatch(/KHÔNG phải JAC/);
  });
});

describe("Tái tích luỹ vs phân phối (tr.85–102)", () => {
  it("đáy sớm, đáy nâng dần, KL nến giảm thấp, biên độ thu hẹp -> nghiêng tích luỹ", () => {
    const b: Bar[] = [];
    for (let k = 0; k < 40; k++) {
      const amp = k < 20 ? 5 : 2, c = 100 + k * 0.08 + amp * Math.sin((2 * Math.PI * k) / 8), up = Math.cos((2 * Math.PI * k) / 8) > 0;
      bar(b, up ? c - 0.5 : c + 0.5, c + amp * 0.3, c - amp * 0.3, c, k >= 20 && !up ? 0.5 * V : V);
    }
    expect(rangeLean(b, { start: 0, end: 39, high: 110, low: 90 })!.label).toBe("tích luỹ");
  });
  it("đỉnh sớm, đỉnh hạ dần, KL nến giảm tăng, biên độ lỏng dần -> nghiêng phân phối", () => {
    const b: Bar[] = [];
    for (let k = 0; k < 40; k++) {
      const amp = k < 20 ? 2 : 5, c = 100 - k * 0.08 + amp * Math.sin((2 * Math.PI * k) / 8), up = Math.cos((2 * Math.PI * k) / 8) > 0;
      bar(b, up ? c - 0.5 : c + 0.5, c + amp * 0.3, c - amp * 0.3, c, k >= 20 && !up ? 2 * V : V);
    }
    expect(rangeLean(b, { start: 0, end: 39, high: 110, low: 90 })!.label).toBe("phân phối");
  });
});

describe("Gắn vào engine", () => {
  it("v2 và v3 trả `evidence`; Spring của v2 có nhãn #loại; chưa qua kiểm định -> không đổi pha", () => {
    const w2 = classifyWyckoffV2(staleSpringSeries(0));
    expect(w2.evidence).toBeTruthy();
    const sp = w2.events.find((e) => e.event === "Spring")!;
    expect(sp.label).toMatch(/^Spring#[123]$/);
    const a = analyze(classicAccumulationSeries(), { timeframe: "D" });
    expect(a.wyckoffAlt?.evidence).toBeTruthy();
    expect(Object.values(WYCKOFF_EVIDENCE_POLICY).every((x) => x === false)).toBe(true);
  });
});
