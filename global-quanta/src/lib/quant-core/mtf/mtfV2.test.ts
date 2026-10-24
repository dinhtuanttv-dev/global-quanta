// @vitest-environment node
// MTF v2 — bám đúng tài liệu gốc: đối chiếu với CHÍNH bản Python mtf_market_structure.py (oracle sinh bằng
// backend/scripts/structure-oracle.py trên du_lieu_mau_1h.csv của tài liệu) + các bất biến không nhìn trước.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { analyzeTf } from "./index";
import { alignMatrix, verdictLabel } from "./align";
import { displaySegments } from "./compact";

const dir = new URL("./__fixtures__/", import.meta.url);
const bars: Bar[] = readFileSync(new URL("source_demo_1h.csv", dir), "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [t, o, h, lo, c, v] = l.split(",");
  return { date: t.slice(0, 16), open: +o, high: +h, low: +lo, close: +c, volume: +v };
});
const oracle = JSON.parse(readFileSync(new URL("source_demo_oracle.json", dir), "utf8")) as {
  stage: string[]; signals: { date: string; code: string }[]; patterns: { type: string; ready: number; break: number | null }[];
};
const a = analyzeTf(bars, "H1");

describe("MTF v2 — trùng bản Python gốc trên dữ liệu mẫu của tài liệu (750 nến 1 giờ)", () => {
  it("giai đoạn thô trùng 100% (B′ của engine = DOWN / RANGE của bản gốc)", () => {
    let n = 0;
    for (let i = 0; i < bars.length; i++) {
      if (!oracle.stage[i]) continue;
      n++;
      const js = a.stage[i] === "Bp" ? ["DOWN", "RANGE"] : [a.stage[i]];
      expect(js, `nến ${i} ${bars[i].date}`).toContain(oracle.stage[i]);
    }
    expect(n).toBeGreaterThan(600);
  });

  it("tín hiệu Granville 1–4 và điểm vào cốt lõi L / S trùng từng nến", () => {
    const js = a.signals.filter((s) => s.code !== "G3").map((s) => `${bars[s.index].date}|${s.code}`);
    expect(js).toEqual(oracle.signals.map((s) => `${s.date}|${s.code}`));
    expect(js.some((k) => k.endsWith("|L"))).toBe(true);
    expect(js.some((k) => k.endsWith("|S"))).toBe(true);
  });

  it("mẫu W / M / vai–đầu–vai: cùng loại, cùng nến xác nhận và nến phá viền cổ", () => {
    expect(a.patterns.map((p) => `${p.type}@${p.confirmedIndex}->${p.breakIndex}`)).toEqual(oracle.patterns.map((p) => `${p.type}@${p.ready}->${p.break}`));
  });

  it("R:R 'nếu mua ở giá hiện tại' giống hộp tóm tắt của ảnh DEMO: cắt lỗ 91,61 · mục tiêu 98,48 · 1:0,3 → giao dịch NG", () => {
    expect(a.stage[a.stage.length - 1]).toBe("A");
    expect(a.rrNow!.stop).toBeCloseTo(91.61, 2);
    expect(a.rrNow!.target).toBeCloseTo(98.48, 2);
    expect(a.rrNow!.rr).toBeCloseTo(0.28, 2);
    expect(a.rrNow!.ok).toBe(false);
  });
});

describe("MTF v2 — không nhìn trước", () => {
  it("giai đoạn / tín hiệu / mẫu / cờ quá đà tại nến t tính trên bars[0..t] trùng toàn chuỗi", () => {
    for (const k of [120, 260, 400, 555, 700]) {
      const part = analyzeTf(bars.slice(0, k), "H1");
      expect(part.stage).toEqual(a.stage.slice(0, k));
      expect(part.ext).toEqual(a.ext.slice(0, k));
      expect(part.signals.map((s) => `${s.index}${s.code}`)).toEqual(a.signals.filter((s) => s.index < k).map((s) => `${s.index}${s.code}`));
      for (const p of part.patterns) {
        const f = a.patterns.find((x) => x.confirmedIndex === p.confirmedIndex && x.type === p.type)!;
        expect(f).toBeTruthy();
        expect(p.breakIndex).toBe(f.breakIndex != null && f.breakIndex < k ? f.breakIndex : null);
      }
    }
  });

  it("đoạn hiển thị: đoạn đã kết thúc < 8 nến gộp vào đoạn trước, đoạn hiện tại giữ nguyên trạng thái thô", () => {
    const segs = displaySegments(a);
    expect(segs[segs.length - 1].stage).toBe(a.stage[a.stage.length - 1]);
    expect(segs.slice(1, -1).every((s) => s.bars >= 8)).toBe(true);
    expect(segs.reduce((s, x) => s + x.bars, 0)).toBe(bars.length);
  });
});

describe("MTF v2 — ma trận đồng thuận theo tài liệu", () => {
  it("B (tái tích lũy) ở khung ngày + khung nhỏ quay lại tăng có tín hiệu + R:R ≥ 1 → MUA (không còn 'quá mua → đứng ngoài')", () => {
    expect(alignMatrix("B", "UP", null, true, { rrOk: true }).verdict).toBe("MUA");
    expect(alignMatrix("B", "B", null, false).verdict).toBe("CHỜ MUA");
  });
  it("cổng R:R: giao dịch NG (R:R < 1) hoặc khung nhỏ quá đà → CHỜ MUA; khung ngày quá đà → R3", () => {
    expect(alignMatrix("UP", "UP", null, true, { rrOk: false }).verdict).toBe("CHỜ MUA");
    expect(alignMatrix("UP", "UP", null, true, { rrOk: true, extEntry: 1 }).verdict).toBe("CHỜ MUA");
    const r = alignMatrix("UP", "UP", null, true, { rrOk: true, extDay: 1 });
    expect([r.verdict, r.rule]).toEqual(["CHỜ MUA", "R3"]);
  });
  it("nhãn hiển thị: khi chưa kiểm định đạt, dùng lời mô tả thay chữ MUA / BÁN", () => {
    expect(verdictLabel("MUA", false)).toBe("Cấu trúc thuận tăng");
    expect(verdictLabel("BÁN", false)).toBe("Cấu trúc giảm");
    expect(verdictLabel("BÁN", true)).toBe("BÁN");
  });
});
