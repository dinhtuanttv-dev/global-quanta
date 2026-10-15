import { describe, expect, it } from "vitest";
import { sectorLabelVi } from "./sectorLabelVi";

describe("sectorLabelVi", () => {
  it("thêm dấu cho nhãn ngành không dấu, giữ nguyên nhãn lạ / đã có dấu", () => {
    expect(sectorLabelVi("Bat dong san")).toBe("Bất động sản");
    expect(sectorLabelVi("Phan bon/Hoa chat")).toBe("Phân bón/Hóa chất");
    expect(sectorLabelVi("Xuat khau (Go, Thuy san)")).toBe("Xuất khẩu (Gỗ, Thủy sản)");
    expect(sectorLabelVi("Ngân hàng")).toBe("Ngân hàng");
    expect(sectorLabelVi("ABC")).toBe("ABC");
  });
});
