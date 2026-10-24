// A5 (Q-04) — PHÁT LẠI TỪNG TIỀN TỐ: với mỗi engine tự nhận point-in-time, mọi sự kiện / vùng đã XÁC NHẬN tại nến t phải GIỐNG HỆT
// dù tính trên bars[0..t] hay trên toàn bộ chuỗi (thêm nến sau không được sinh / xoá / dời sự kiện đã xác nhận — không "vẽ lại").
// Dữ liệu thật: FPT + VNINDEX (SSI, 800 phiên). Wyckoff không thuộc diện này: phân loại hồi tố theo vùng giá, đã gắn nhãn INFERRED / lịch sử.
import { describe, expect, it } from "vitest";
import fx from "../ta-command-center/__fixtures__/ssiDaily800.json";
import { analyze, buildFlowBars, detectCvdDivergence } from "./index";

type Row = [string, number, number, number, number, number];
const toBars = (rows: Row[]) => rows.map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }));
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

function confirmedAt(bars: ReturnType<typeof toBars>, t: number, isIndex: boolean) {
  const a = analyze(bars, { isIndex, timeframe: "D" });
  const keep = <T extends { confirmedIndex: number | null }>(xs: T[]) => xs.filter((x) => x.confirmedIndex != null && x.confirmedIndex <= t);
  const flow = buildFlowBars(bars, []);
  return {
    pivots: keep(a.pivots).map((p) => `${p.kind}|${p.index}|${r6(p.price)}|${p.confirmedIndex}`),
    structure: keep(a.structure).map((e) => `${e.kind}|${e.dir}|${e.index}|${r6(e.level)}|${e.pivotIndex}|${e.confirmedIndex}`),
    orderBlocks: keep(a.orderBlocks).map((z) => `${z.dir}|${z.kind}|${z.index}|${r6(z.top)}|${r6(z.bottom)}|${z.confirmedIndex}`),
    fvgs: keep(a.fvgs).map((g) => `${g.dir}|${g.index}|${r6(g.top)}|${r6(g.bottom)}|${g.confirmedIndex}`),
    liquidity: keep(a.liquidity).map((z) => `${z.side}|${r6(z.level)}|${z.pivotIndexes.join(",")}|${z.confirmedIndex}`),
    vsa: keep(a.vsa).map((v) => `${v.type}|${v.dir}|${v.index}|${v.confirmedIndex}`),
    divergences: keep(detectCvdDivergence(a.pivots, flow)).map((d) => `${d.dir}|${d.index}|${d.pivotIndex}|${d.confirmedIndex}`),
  };
}

describe("A5 — không vẽ lại sự kiện đã xác nhận (phát lại từng tiền tố)", () => {
  for (const [symbol, isIndex] of [["FPT", false], ["VNINDEX", true]] as const) {
    const bars = toBars((fx as unknown as Record<string, { bars: Row[] }>)[symbol].bars);
    it(`${symbol}: pivot · BOS/CHoCH · OB · FVG · thanh khoản · VSA · CVD divergence`, () => {
      for (const t of [300, 450, 600, 720]) {
        const prefix = confirmedAt(bars.slice(0, t + 1), t, isIndex);
        const full = confirmedAt(bars, t, isIndex);
        for (const k of Object.keys(full) as (keyof typeof full)[]) {
          expect(prefix[k], `${symbol} t=${t} ${k}`).toEqual(full[k]);
        }
        expect(full.structure.length + full.pivots.length, "có sự kiện để kiểm").toBeGreaterThan(10);
      }
    });
  }
});
