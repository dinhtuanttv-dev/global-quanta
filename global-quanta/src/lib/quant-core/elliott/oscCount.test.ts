import { describe, expect, it } from "vitest";
import { oscAgreement, oscillatorCount } from "./oscCount";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const legs = (L: number[][]) => (i: number) => {
  for (let k = 1; k < L.length; k++) if (i <= L[k][0]) { const [i0, p0] = L[k - 1], [i1, p1] = L[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return L[L.length - 1][1];
};
const bars = (n: number, f: (i: number) => number): OhlcvBar[] => Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i), open: c, high: c * 1.004, low: c * 0.996, close: c, volume: 1 }; });
// Đi ngang dài (dải 80% nhỏ) rồi: sóng 1, 2, sóng 3 rất mạnh, sóng 4 dài (dao động về 0), sóng 5 yếu hơn
const PATH = [[0, 100], [150, 100], [175, 108], [190, 104], [225, 140], [285, 128], [330, 146]];

describe("E2 — đếm sóng theo dao động", () => {
  it("đi ngang -> chưa có đỉnh sóng 3 vượt dải", () => {
    expect(oscillatorCount(bars(200, (i) => 100 + Math.sin(i / 4))).wave).toBe("none");
  });
  it("đang chạy sóng 3: dao động vẫn gần đỉnh", () => {
    const r = oscillatorCount(bars(226, legs(PATH)));
    expect(r.wave).toBe("3"); expect(r.dir).toBe("up");
  });
  it("sóng 4: dao động rơi dưới 50% đỉnh nhưng chưa về 90%", () => {
    const r = oscillatorCount(bars(250, legs(PATH)));
    expect(r.wave).toBe("4"); expect(r.w3?.date).toBe(day(225));
  });
  it("sóng 5 sau khi dao động về ≥ 90%: phân kỳ (đỉnh dao động sóng 5 < sóng 3), không nhìn trước", () => {
    const b = bars(331, legs(PATH)), r = oscillatorCount(b);
    expect(r.wave).toBe("5"); expect(r.divergence).toBe(true);
    expect(r.w4!.i).toBeGreaterThanOrEqual(270); expect(r.w4!.i).toBeLessThanOrEqual(290);
    expect(r.w5!.price).toBeGreaterThan(r.w3!.price);
    // Chỉ dùng dữ liệu ≤ t: thêm nến tương lai không đổi kết quả tại t
    expect(oscillatorCount(b.slice(0, 300)).wave).toBe(oscillatorCount(bars(400, legs(PATH)).slice(0, 300)).wave);
  });
  it("sau sóng 5: giá về lại cực trị sóng 4 (T-19) -> 'post', không kẹt ở sóng 5 cũ", () => {
    const r = oscillatorCount(bars(332, legs([...PATH, [331, 127]])));
    expect(r.wave).toBe("post"); expect(r.label).toContain("cực trị sóng 4");
  });
  it("sau sóng 5: dao động đổi chiều qua 0 -> 'post' dù giá chưa về sóng 4", () => {
    const r = oscillatorCount(bars(346, legs([...PATH, [345, 141]])));
    expect(r.wave).toBe("post"); expect(r.label).toContain("đổi chiều qua 0");
  });
  it("so khớp với đếm hình học", () => {
    const r = oscillatorCount(bars(331, legs(PATH)));
    expect(oscAgreement(r, { wave: "5", dir: "up" })).toBe("match");
    expect(oscAgreement(r, { wave: "3", dir: "up" })).toBe("differ");
    expect(oscAgreement(r, { wave: "none", dir: null })).toBe("na");
  });
});
