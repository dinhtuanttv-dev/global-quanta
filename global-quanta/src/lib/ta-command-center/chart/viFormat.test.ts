import { describe, expect, it } from "vitest";
import { TickMarkType, type UTCTimestamp } from "lightweight-charts-v5";
import { priceDigitsFor, viCrosshairTime, viPrice, viTickMark, viVolume } from "./viFormat";
import { chartTime } from "./time";

describe("TA-T1 — định dạng tiếng Việt cho chart", () => {
  it("số kiểu Việt, đúng số chữ số thập phân, giống chú giải", () => {
    expect(viPrice(1653.9)).toBe("1.653,90");
    expect(viPrice(53)).toBe("53,00");
    expect(viPrice(-7.731)).toBe("-7,73");
    expect(viPrice(Number.NaN)).toBe("");
  });
  it("khối lượng gọn: tỷ / tr / N, không dùng chữ tiếng Anh B / M / K", () => {
    expect(viVolume(460_960_000)).toBe("460,96 tr");
    expect(viVolume(1_200_000_000)).toBe("1,2 tỷ");
    expect(viVolume(4_500)).toBe("4,5 N");
    expect(viVolume(-2_000_000)).toBe("−2 tr");
    expect(viVolume(0)).toBe("0");
  });
  it("mốc trục thời gian: năm · Th(tháng) · ngày · giờ", () => {
    const t = chartTime("2026-07-24");
    expect(viTickMark(t, TickMarkType.Year)).toBe("2026");
    expect(viTickMark(t, TickMarkType.Month)).toBe("Th7");
    expect(viTickMark(t, TickMarkType.DayOfMonth)).toBe("24");
    expect(viTickMark(chartTime("2026-07-24T10:15:00"), TickMarkType.Time)).toBe("10:15");
  });
  it("nhãn crosshair: thứ, ngày, tháng, năm (khung ngày) + giờ (khung trong ngày), theo giờ VN", () => {
    expect(viCrosshairTime(chartTime("2026-07-24"), false)).toBe("T6, 24 Th7 '26");
    expect(viCrosshairTime(chartTime("2026-07-24T10:15:00"), true)).toBe("T6, 24 Th7 '26 10:15");
    expect(viCrosshairTime(chartTime("2026-07-26") as UTCTimestamp, false)).toBe("CN, 26 Th7 '26");
  });
  it("độ chính xác theo mã: cổ phiếu (giá nguyên đồng) 0 chữ số, chỉ số 2 chữ số", () => {
    expect(priceDigitsFor([{ close: 96700 }, { close: 59900 }])).toBe(0);
    expect(priceDigitsFor([{ close: 1653.9 }, { close: 1640 }])).toBe(2);
    expect(priceDigitsFor([{ close: 850 }])).toBe(2);
    expect(priceDigitsFor([])).toBe(2);
  });
});
