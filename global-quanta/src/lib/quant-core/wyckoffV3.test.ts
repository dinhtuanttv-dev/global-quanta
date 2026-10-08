import { describe, expect, it } from "vitest";
import { analyzeWyckoff } from "./wyckoffV3/wyckoffGet.js";
import { classifyWyckoffV3 } from "./wyckoffV3";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";
import type { Bar } from "./math";

const candles = (b: Bar[]) => b.map((x) => ({ time: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume }));
const evKey = (e: { type: string; i: number; ci: number | null }) => `${e.type}@${e.i}/${e.ci}`;

describe("Wyckoff v3 — máy trạng thái Phase A → E", () => {
  it("tích luỹ chuẩn: SC → AR → ST → Spring → Test → SOS → BUA/LPS → Phase E, đúng thứ tự xác nhận", () => {
    const r = analyzeWyckoff(candles(classicAccumulationSeries()));
    const s = r.structures.find((x) => x.kind === "accumulation")!;
    const types = s.events.map((e) => e.type);
    for (const t of ["SC", "AR", "ST", "SPRING_3", "TEST", "SOS", "BUA", "LPS", "E_BREAKOUT"]) expect(types).toContain(t);
    expect(s.phase).toBe("E");
    expect(s.status).toBe("completed");
    // ngày xác nhận không bao giờ trước ngày xảy ra; SC/AR chỉ xác nhận khi có ST; Spring khi đóng cửa lại trong TR
    for (const e of s.events) if (e.ci != null) expect(e.ci).toBeGreaterThanOrEqual(e.i);
    const sc = s.events.find((e) => e.type === "SC")!, st = s.events.find((e) => e.type === "ST")!;
    expect(sc.ci).toBe(st.ci);
    const spring = s.events.find((e) => e.type === "SPRING_3")!;
    expect(spring.ci).toBeGreaterThan(spring.i);
  });

  it("adapter: Phase E còn mới -> pha hiện tại Markup, active; ngày sự kiện ≠ ngày xác nhận được giữ", () => {
    const w = classifyWyckoffV3(classicAccumulationSeries());
    expect(w.engine).toBe("v3");
    expect(w.status).toBe("active");
    expect(w.phase).toBe("markup");
    expect(w.wyckoffPhase).toBe("E");
    const spring = w.events.find((e) => e.label === "SPRING_3")!;
    expect(spring.confirmedDate).not.toBe(spring.date);
    expect(w.plan?.action).toBeTruthy();
  });

  it("bất biến nhân quả: cập nhật từng nến, sự kiện ĐÃ XÁC NHẬN của cấu trúc có climax không đổi về sau", () => {
    for (const series of [classicAccumulationSeries(), staleSpringSeries(40)]) {
      const c = candles(series);
      const confirmedAt = new Map<string, number>(); // khoá sự kiện -> t lần đầu thấy đã xác nhận
      for (let t = 60; t < c.length; t++) {
        const r = analyzeWyckoff(c.slice(0, t + 1));
        const now = new Set<string>();
        for (const s of r.structures) if (!s.generic) for (const e of s.events) if (e.ci != null) {
          expect(e.ci).toBeLessThanOrEqual(t); // không có sự kiện "xác nhận ở tương lai"
          const k = `${s.key}|${evKey(e)}`;
          now.add(k);
          if (!confirmedAt.has(k)) confirmedAt.set(k, t);
        }
        for (const [k, t0] of confirmedAt) if (t0 < t) expect(now.has(k), `sự kiện ${k} (xác nhận tại ${t0}) biến mất ở ${t}`).toBe(true);
      }
      expect(confirmedAt.size).toBeGreaterThan(0);
    }
  });

  it("lỗi trong ảnh: Spring/range cũ, giá xa dưới range -> 'Chưa xác định' + cấu trúc lịch sử, không phải Spring hiện tại", () => {
    const w = classifyWyckoffV3(staleSpringSeries(90));
    expect(w.phase).toBe("undetermined");
    expect(w.status).toBe("historical");
    expect(w.historical).toBeTruthy();
    expect(w.statusReason).toMatch(/Không có cấu trúc Wyckoff đang hoạt động/);
  });

  it("Spring thất bại: đóng cửa dưới đáy Spring -> cấu trúc failed (SPRING_FAIL), không còn active", () => {
    const b = classicAccumulationSeries().slice(0, 92); // tới sau Test
    const last = b[b.length - 1];
    const d = (i: number) => new Date(Date.parse(`${last.date}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    for (let k = 1; k <= 6; k++) { const c = 92 - k * 0.8; b.push({ date: d(k), open: c + 0.5, high: c + 0.8, low: c - 0.6, close: c, volume: 1_500_000 }); }
    const r = analyzeWyckoff(candles(b));
    const s = r.structures.find((x) => x.kind === "accumulation")!;
    expect(s.status).toBe("failed");
    expect(s.events.map((e) => e.type)).toContain("SPRING_FAIL");
    expect(r.current?.key === s.key).toBe(false);
  });

  it("dữ liệu ngắn / thiếu volume / volume bằng 0 -> insufficient với lý do rõ", () => {
    const b = classicAccumulationSeries();
    expect(classifyWyckoffV3(b.slice(0, 30)).status).toBe("insufficient");
    expect(classifyWyckoffV3(b.map((x, i) => (i === 5 ? { ...x, volume: Number.NaN } : x))).statusReason).toMatch(/khối lượng/);
    expect(classifyWyckoffV3(b.map((x) => ({ ...x, volume: 0 }))).statusReason).toMatch(/bằng 0/);
  });

  it("khung nhỏ và chỉ số: có cảnh báo rõ ràng", () => {
    const b = classicAccumulationSeries();
    expect(classifyWyckoffV3(b, { timeframe: "15m" }).caveats?.[0]).toMatch(/Khung 15m/);
    expect(classifyWyckoffV3(b, { timeframe: "D", isIndex: true }).caveats?.join(" ")).toMatch(/không giao dịch trực tiếp/);
  });
});
