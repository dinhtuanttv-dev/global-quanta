import { describe, expect, it } from "vitest";
import { buildSessionProfiles, buildVolumeProfile, nodes, profileBinSize, valueArea } from "./volumeProfile";
import { anchoredVwap, anchorIndexOf } from "./vwap";
import type { Bar } from "./math";

const bar = (date: string, low: number, high: number, volume: number, close = (low + high) / 2): Bar => ({ date, open: close, high, low, close, volume });

describe("Volume Profile — bin, POC, Value Area (CME), HVN/LVN", () => {
  it("bin theo bước giá thật; gộp bội số khi quá maxBins", () => {
    expect(profileBinSize(60_000, 62_000, false, 120)).toBe(100); // ≥ 50.000đ -> 100đ, 20 bin
    expect(profileBinSize(20_000, 30_000, false, 120)).toBe(50 * Math.ceil(200 / 120)); // 200 bin -> gộp ×2
    expect(profileBinSize(1700, 1800, true, 120)).toBeCloseTo(Math.ceil(10000 / 120) * 0.01, 6);
  });

  it("phân phối đều theo phần giao: nến 100–300 (2 bin) chia đôi; POC = bin dày nhất", () => {
    const p = buildVolumeProfile([bar("d1", 60_000, 60_200, 1000), bar("d2", 60_100, 60_150, 3000)], {})!;
    expect(p.binSize).toBe(100);
    const sum = p.bins.reduce((s, b) => s + b.volume, 0);
    expect(sum).toBeCloseTo(4000, 6);
    expect(p.poc).toBe(60_150); // bin 60.100–60.200
    expect(p.totalVolume).toBeCloseTo(4000, 6);
  });

  it("Value Area 70% chuẩn CME: so 2 bin trên với 2 bin dưới, nhận cặp lớn hơn", () => {
    //        idx: 0   1   2   3   4   5   6
    const vol = [5, 10, 20, 40, 30, 8, 2]; // tổng 115, 70% = 80,5
    // POC=3 (40). B1: trên 30+8=38 > dưới 20+10=30 -> nhận 4,5 (78). B2: trên 2 < dưới 30 -> nhận 2,1 (108) ≥ 80,5
    expect(valueArea(vol, 3)).toEqual([1, 5]);
  });

  it("bỏ nến khớp định kỳ (ATO/ATC) khỏi profile khớp liên tục", () => {
    const bars = [bar("2026-10-02T09:15:40+07:00", 60_000, 60_000, 9_000_000), bar("2026-10-02T09:20:00+07:00", 60_100, 60_300, 1000)];
    (bars[0] as Bar & { auction?: string }).auction = "ATO";
    const p = buildVolumeProfile(bars)!;
    expect(p.totalVolume).toBeCloseTo(1000, 6);
  });

  it("HVN = đỉnh trên profile làm mượt, LVN = đáy ở giữa hai đỉnh", () => {
    const vol = [1, 5, 30, 60, 30, 5, 1, 1, 2, 1, 1, 5, 40, 70, 40, 5, 1];
    const { hvn, lvn } = nodes(vol, 13);
    expect(hvn).toEqual(expect.arrayContaining([3, 13]));
    expect(lvn.some((i) => i >= 6 && i <= 10)).toBe(true);
  });

  it("phương pháp tam giác (nến ngày, xấp xỉ) dồn KL về giá điển hình", () => {
    const p = buildVolumeProfile([bar("d", 60_000, 61_000, 10_000, 60_900)], { method: "triangular" })!;
    const tp = (61_000 + 60_000 + 60_900) / 3;
    expect(Math.abs(p.poc - tp)).toBeLessThanOrEqual(p.binSize);
  });
});

describe("Session profile + naked POC", () => {
  it("POC phiên 1 chưa bị chạm ở phiên 2 -> naked; phiên 2 chạm POC phiên 1 -> nakedUntil", () => {
    const s1 = [bar("2026-09-30T09:30:00+07:00", 60_000, 60_100, 5000), bar("2026-09-30T10:00:00+07:00", 60_000, 60_100, 5000)];
    const s2far = [bar("2026-10-01T09:30:00+07:00", 61_000, 61_200, 3000)];
    const r = buildSessionProfiles([...s1, ...s2far]);
    expect(r[0].naked).toBe(true);
    const s2touch = [bar("2026-10-01T09:30:00+07:00", 59_900, 60_200, 3000)];
    const r2 = buildSessionProfiles([...s1, ...s2touch]);
    expect(r2[0].naked).toBe(false);
    expect(r2[0].nakedUntil).toBe("2026-10-01T09:30:00+07:00");
  });
});

describe("Anchored VWAP", () => {
  it("VWAP & σ có trọng số khối lượng từ nến neo; không dùng dữ liệu trước neo", () => {
    const bars = [bar("a", 9, 9, 100, 9), bar("b", 10, 10, 1, 10), bar("c", 20, 20, 3, 20)];
    const v = anchoredVwap(bars, anchorIndexOf(bars, "b"));
    expect(v).toHaveLength(2);
    expect(v[0].vwap).toBe(10);
    expect(v[1].vwap).toBeCloseTo((10 + 60) / 4, 9); // 17,5
    expect(v[1].sigma).toBeCloseTo(Math.sqrt((100 + 1200) / 4 - 17.5 ** 2), 9);
    expect(anchoredVwap(bars, -1)).toEqual([]);
  });
});
