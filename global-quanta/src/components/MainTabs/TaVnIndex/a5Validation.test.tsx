// A5 — backtest dock: tín hiệu chưa đủ kỳ hạn bị loại công khai, cửa sổ không chồng nhau (R-02/R-04); tuổi bản quét bộ lọc (R-07).
import { describe, expect, it } from "vitest";
import { eventStudy } from "../../../lib/quant-core/eventStudy";
import { lastClosedSession, sessionsBehind } from "./ScanAge";

const bars = Array.from({ length: 100 }, (_, i) => ({ date: `d${i}`, open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100 + i * 0.1, volume: 1 }));
const at = (vn: string) => Date.parse(`${vn}+07:00`);

describe("A5 — event study", () => {
  it("tín hiệu trong cửa sổ của tín hiệu trước bị bỏ; tín hiệu sát cuối dữ liệu bị loại — đều được đếm", () => {
    const r = eventStudy(bars as never, [10, 12, 15, 30, 95, 97], "bullish", "x", 10);
    expect(r.n).toBe(2);              // 10, 30
    expect(r.overlapDropped).toBe(2); // 12, 15 nằm trong 10 phiên sau 10
    expect(r.censored).toBe(2);       // 95, 97 chưa đủ 10 phiên
  });
});

describe("A5 — tuổi bản quét", () => {
  it("phiên đã đóng gần nhất theo giờ VN (bỏ cuối tuần)", () => {
    expect(lastClosedSession(at("2026-10-23T14:00"))).toBe("2026-10-22"); // thứ Sáu trước 15:00
    expect(lastClosedSession(at("2026-10-23T15:30"))).toBe("2026-10-23");
    expect(lastClosedSession(at("2026-10-25T10:00"))).toBe("2026-10-23"); // Chủ nhật
    expect(lastClosedSession(at("2026-10-26T09:00"))).toBe("2026-10-23"); // thứ Hai sáng
  });
  it("đếm số phiên chậm (bỏ cuối tuần)", () => {
    expect(sessionsBehind("2026-10-23", "2026-10-23")).toBe(0);
    expect(sessionsBehind("2026-10-22", "2026-10-26")).toBe(2);
  });
});
