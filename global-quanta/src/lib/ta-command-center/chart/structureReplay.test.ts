import { describe, expect, it } from "vitest";
import type { OhlcvBar } from "../types";
import { replayDoc, REPLAY_MIN_BARS } from "./structureReplay";
import { structureSceneItems } from "./structureScene";

function daily(n: number): OhlcvBar[] {
  const out: OhlcvBar[] = []; const d = new Date("2025-01-02T00:00:00Z"); let p = 30_000;
  while (out.length < n) {
    if (d.getUTCDay() % 6) { const o = p; p *= 1 + Math.sin(out.length / 11) * 0.012; out.push({ date: d.toISOString().slice(0, 10), open: o, high: Math.max(o, p) * 1.008, low: Math.min(o, p) * 0.992, close: p, volume: 1e6 }); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("Phát lại cấu trúc (T6)", () => {
  const bars = daily(320);
  it("chỉ dùng dữ liệu tới phiên phát lại: kết quả không đổi khi thêm nến tương lai", () => {
    const i = 250;
    const a = replayDoc(bars, i, null, "AAA")!;
    const b = replayDoc(bars.slice(0, i + 1), i, null, "AAA")!;
    expect(a.asOf).toBe(bars[i].date);
    expect(a.tfs.D?.segments).toEqual(b.tfs.D?.segments);
    expect(a.align).toEqual(b.align);
    expect(a.cone).toBeNull();
    expect(replayDoc(bars, REPLAY_MIN_BARS - 2, null)).toBeNull();
  });
  it("lớp phủ neo 'Phát lại' vào nến của phiên đã chọn, nến sau vẫn hiển thị", () => {
    const i = 260;
    const doc = replayDoc(bars, i, null, "AAA")!;
    const items = structureSceneItems(bars, "D", doc, "trade", { asOf: bars[i].date });
    const v = items.find((x) => x.kind === "vline" && x.label?.text.startsWith("Phát lại"));
    expect(v && v.kind === "vline" && v.t).toBe(bars[i].date);
    for (const f of items.filter((x) => x.kind === "future")) expect(f.kind === "future" && f.from).toBe(bars[i].date);
  });
});
