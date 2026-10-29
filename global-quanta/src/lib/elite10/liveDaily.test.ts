// N3 — nến ngày thời gian thực: nến hôm nay từ bản tin giá, ghép vào chuỗi nến chính thức, VN-Index trực tiếp, quy đổi sang thang CAR.
import { describe, expect, it } from "vitest";
import type { DailyBar } from "./timingSpace";
import fptBars from "./__fixtures__/ohlcv-FPT-5y.json";
import vniBars from "./__fixtures__/ohlcv-VNINDEX-5y.json";
import { candlesInCar, liveBarFromQuote, mergeLiveBar, mergeLiveIndex } from "./liveDaily";
import { buildTimingSpace, esaDailyAt, ESA_DAILY, marketValueMap } from "./timingSpace";
import div from "./__fixtures__/event-study-FPT-dividend.json";
import type { EventStudy } from "./timingSim";

const q = { price: 53100, open: 52800, high: 53400, low: 52500, totalVolume: 4_200_000, totalValue: 222e9 };

describe("nến hôm nay từ luồng giá", () => {
  it("dựng nến ngày (đang hình thành); thiếu giá khớp / mở cửa -> null; cao/thấp luôn bao mở/đóng", () => {
    expect(liveBarFromQuote(q, "2026-10-30")).toEqual({ date: "2026-10-30", open: 52800, high: 53400, low: 52500, close: 53100, volume: 4_200_000, value: 222e9, partial: true });
    expect(liveBarFromQuote({ ...q, price: null }, "2026-10-30")).toBeNull();
    expect(liveBarFromQuote({ ...q, open: null }, "2026-10-30")).toBeNull();
    const odd = liveBarFromQuote({ ...q, high: 52000, low: 54000 }, "2026-10-30")!;
    expect(odd.high).toBe(53100); expect(odd.low).toBe(52800);
  });
  it("ghép: thay nến cùng ngày, nối nến ngày mới, không ghi đè nến tương lai", () => {
    const bars: DailyBar[] = [{ date: "2026-10-28", close: 1, volume: 1 }, { date: "2026-10-29", close: 2, volume: 1 }];
    const live = liveBarFromQuote(q, "2026-10-29")!;
    expect(mergeLiveBar(bars, live)).toHaveLength(2);
    expect(mergeLiveBar(bars, live)[1]).toBe(live);
    expect(mergeLiveBar(bars, { ...live, date: "2026-10-30" })).toHaveLength(3);
    expect(mergeLiveBar(bars, { ...live, date: "2026-10-27" })).toBe(bars);
    const mi = mergeLiveIndex(bars, { value: 1760, totalValue: 1.2e13 }, "2026-10-30");
    expect(mi[mi.length - 1]).toMatchObject({ date: "2026-10-30", close: 1760, value: 1.2e13 });
  });
  it("quy đổi nến sang thang lợi suất vượt VN-Index: neo 0 tại phiên đầu; đóng cửa khớp công thức CAR", () => {
    const bars = fptBars as DailyBar[], vni = vniBars as DailyBar[];
    const cs = candlesInCar(-75, bars, vni, -16);
    expect(cs[0].offset).toBe(-75);
    expect(cs[0].c).toBeCloseTo(0, 12);
    const last = cs[cs.length - 1], b0 = bars[bars.length - 60], b1 = bars[bars.length - 1];
    const i0 = vni.find((x) => x.date === b0.date)!.close!, i1 = vni.find((x) => x.date === b1.date)!.close!;
    expect(last.c).toBeCloseTo(Math.expm1(Math.log(b1.close! / b0.close!) - Math.log(i1 / i0)), 10);
    expect(candlesInCar(-75, bars, vni, 3)).toEqual([]);
  });
});

describe("ESA ngày đã trừ yếu tố thị trường", () => {
  const mk = (n: number, f: (i: number) => [number, number]) => {
    const bars: DailyBar[] = [], idx: DailyBar[] = [];
    for (let i = 0; i < n; i++) { const [v, m] = f(i); const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10); bars.push({ date: d, volume: 1, value: v }); idx.push({ date: d, volume: 1, value: m, close: 1000 }); }
    return { bars, idx };
  };
  it("cả sàn cùng bùng ×4 -> KHÔNG bất thường; chỉ mã bùng ×4 -> bất thường mức cao", () => {
    const wob = (i: number) => 1 + 0.05 * Math.sin(i * 1.7);
    const all = mk(70, (i) => (i === 65 ? [400 * wob(i), 4000] : [100 * wob(i), 1000]));
    const one = mk(70, (i) => (i === 65 ? [400 * wob(i), 1000] : [100 * wob(i), 1000]));
    expect(esaDailyAt(all.bars, 65, ESA_DAILY, marketValueMap(all.bars, all.idx))!.level).toBe("none");
    expect(esaDailyAt(all.bars, 65, ESA_DAILY, null)!.level).not.toBe("none"); // bản chưa trừ thị trường báo nhầm
    expect(esaDailyAt(one.bars, 65, ESA_DAILY, marketValueMap(one.bars, one.idx))!.level).toBe("high");
  });
  it("FPT: trừ yếu tố thị trường loại phần lớn 'bất thường' do cả sàn (84 -> 24 phiên)", () => {
    const es = div as unknown as EventStudy;
    const raw = buildTimingSpace(es, fptBars as DailyBar[], -16, null, "2026-10-29", []);
    const adj = buildTimingSpace(es, fptBars as DailyBar[], -16, null, "2026-10-29", vniBars as DailyBar[]);
    expect(raw.marketAdjusted).toBe(false); expect(adj.marketAdjusted).toBe(true);
    expect(raw.anomalies).toBe(84); expect(adj.anomalies).toBe(24);
  });
  it("giá trị GD toàn sàn phủ < 90% phiên -> không trộn cách chấm (null)", () => {
    const bars = fptBars as DailyBar[];
    expect(marketValueMap(bars, (vniBars as DailyBar[]).slice(-300))).toBeNull();
  });
});
