import { describe, expect, it } from "vitest";
import { newestFirst } from "../../../../macro-center/src/ui/world/WorldTab";
import { basketConcentration, fmtPeriod, isConcentrated, pickLabels, splitByTier, sectorPoints, sectorPressure, transmissionEdges, type MatrixCell } from "./world2d";

describe("Độ tập trung rổ ngành", () => {
  it("số mã hiệu dụng 1/Σw² trên trọng số chuẩn hoá; cờ khi một mã ≥ 50% hoặc dưới 2,5 mã", () => {
    const dcl = basketConcentration([{ ticker: "DCL", weight: 0.9663 }, { ticker: "TNH", weight: 0.018 }, { ticker: "DHG", weight: 0.0156 }])!;
    expect(dcl.top.ticker).toBe("DCL");
    expect(dcl.topShare).toBeCloseTo(0.9663, 3);
    expect(dcl.nEff).toBeCloseTo(1.07, 1);
    expect(isConcentrated(dcl)).toBe(true);
    const even = basketConcentration([0.25, 0.25, 0.25, 0.25].map((weight, i) => ({ ticker: `M${i}`, weight })))!;
    expect(even.nEff).toBeCloseTo(4);
    expect(isConcentrated(even)).toBe(false);
    expect(basketConcentration([])).toBeNull();
    expect(isConcentrated(null)).toBe(false);
  });
});

describe("Bản đồ ngành", () => {
  it("ghép z ngắn hạn với điểm 3 tháng; thiếu một trục thì không vẽ", () => {
    const pts = sectorPoints(
      [
        { icb: "4500", nameVi: "Y tế", zx: 1.3, stance: "overweight", alphaBps: 6.9, constituents: [{ ticker: "DCL", weight: 0.97 }] },
        { icb: "8300", nameVi: "Ngân hàng", zx: -0.5, stance: "underweight", alphaBps: -2, constituents: [{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.25 }, { ticker: "C", weight: 0.25 }] },
        { icb: "0001", nameVi: "Thiếu y", zx: 1, stance: "neutral", alphaBps: 0, constituents: [] },
        { icb: "0002", nameVi: "Thiếu x", zx: null, stance: "neutral", alphaBps: null, constituents: [] },
      ],
      [{ icb: "4500", ws: { score: 1.1 } }, { icb: "8300", ws: { score: -0.4 } }, { icb: "0001", ws: { score: null } }, { icb: "0002", ws: { score: 1 } }],
    );
    expect(pts.map((p) => p.icb)).toEqual(["4500", "8300"]);
    expect(pts[0]).toMatchObject({ x: 1.3, y: 1.1, concentrated: true });
    expect(pts[0].note).toContain("DCL 100%");
  });
});

describe("Bản đồ truyền dẫn", () => {
  const cell = (factor: string, sector: string, beta: number, t: number, tier = "C"): MatrixCell => ({ factor, sector, direction: beta > 0 ? "+" : "-", beta, t, lag: 1, tier });
  const matrix = { factors: [], sectors: [], cells: [cell("OIL", "S_OIL", 2, 3), cell("DXY", "S_BANK", -1, -2.5), cell("OIL", "S_BANK", 1, 1.5), cell("FED", "S_RE", -3, 2.2, "B"), cell("NOZ", "S_RE", 1, 5)] };
  const pulse = [{ id: "OIL", z: 2 }, { id: "DXY", z: 1 }, { id: "FED", z: -1 }];

  it("lọc |t| ≥ 2, cần có z của yếu tố; ưu tiên bậc A/B; áp lực = dấu β × dấu z, độ lớn |t|×|z|", () => {
    const e = transmissionEdges(matrix, pulse);
    expect(e.map((x) => `${x.factor}-${x.sector}`)).toEqual(["FED-S_RE", "OIL-S_OIL", "DXY-S_BANK"]);
    expect(e[0]).toMatchObject({ sign: 1, tier: "B" }); // β âm × z âm: yếu tố đang đẩy ngành lên
    expect(e[1]).toMatchObject({ sign: 1, pressure: 6 });
    expect(e[2]).toMatchObject({ sign: -1, pressure: 2.5 });
  });
  it("giới hạn số đường; cân bằng theo ngành là tổng có dấu", () => {
    expect(transmissionEdges(matrix, pulse, 2, 1)).toHaveLength(1);
    const p = sectorPressure(transmissionEdges(matrix, pulse));
    expect(p.get("S_OIL")).toBe(6);
    expect(p.get("S_BANK")).toBe(-2.5);
  });
});

describe("Chọn nhãn bản đồ", () => {
  const c = (id: string, x: number, y: number) => ({ id, text: "Ngành dài", x, y, toLeft: false });
  it("bỏ nhãn đè nhãn khác hoặc đè điểm; giữ thứ tự ưu tiên và giới hạn", () => {
    expect([...pickLabels([c("a", 0, 0), c("b", 200, 0)], 5)]).toEqual(["a", "b"]);
    expect([...pickLabels([c("a", 0, 0), c("b", 20, 0)], 5)]).toEqual(["b"]);
    expect([...pickLabels([c("a", 0, 0), c("b", 200, 0), c("d", 400, 0)], 2)]).toEqual(["a", "b"]);
  });
});

describe("Danh sách sự kiện", () => {
  it("mới nhất lên đầu, chưa có phiên đứng trước", () => {
    expect(newestFirst([{ sessionDate: "2023-02-02" }, { sessionDate: null }, { sessionDate: "2026-09-17" }]).map((x) => x.sessionDate)).toEqual([null, "2026-09-17", "2023-02-02"]);
  });
});

describe("Trung thực về bậc và kỳ dữ liệu", () => {
  it("tách bậc C khỏi A/B; kỳ tháng hiển thị đúng, thiếu thì không đoán", () => {
    const e = (tier: string) => ({ factor: "F", sector: "S", tier, t: 3, lag: 1, sign: 1 as const, pressure: 1, beta: 1 });
    const s = splitByTier([e("A"), e("B"), e("C"), e("C")]);
    expect(s.confirmed.map((x) => x.tier)).toEqual(["A", "B"]);
    expect(s.exploratory).toHaveLength(2);
    expect(fmtPeriod("2026-09")).toBe("09/2026");
    expect(fmtPeriod(null)).toBe("chưa rõ");
  });
});
