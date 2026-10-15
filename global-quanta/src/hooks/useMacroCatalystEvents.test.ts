import { describe, expect, it } from "vitest";
import { isCoveredByGateway, mergeMacroCalendar, type GatewayMacroEvent } from "./useMacroCatalystEvents";
import { foldVi } from "./useCatalystSearch";

const cat = (sourceId: string, title: string, executionDate: string, daysRemaining: number) => ({ sourceId, title, executionDate, daysRemaining, direction: "benefit" as const, category: "macro" });
const gw: GatewayMacroEvent[] = [
  { id: "release:GSO:2026-11-06", kind: "release", title: "Cục Thống kê (GSO) công bố số liệu tháng 10/2026: CPI", date: "2026-11-06", daysRemaining: 21, country: "VN", estimated: true, evidence: "SCHEDULE_ESTIMATE" },
  { id: "fomc:2026-10-28", kind: "fomc", title: "Fed công bố quyết định lãi suất (FOMC)", date: "2026-10-28", daysRemaining: 12, country: "US", estimated: false, evidence: "OFFICIAL_SCHEDULE" },
];

describe("X3 — lịch vĩ mô hợp nhất", () => {
  it("Gateway là nguồn chính: bỏ CPI/PMI/FOMC tĩnh của engine xúc tác (GSO ngày 29 đã lỗi thời), giữ sự kiện chính sách", () => {
    const merged = mergeMacroCalendar([
      cat("vn-cpi-2026-10-29", "GSO cong bo CPI & so lieu xuat nhap khau", "2026-10-29", 13),
      cat("us-fomc-2026-10-28", "Fed cong bo quyet dinh lai suat (FOMC)", "2026-10-28T19:00:00Z", 12),
      cat("s1", "Nghị định thuế VAT có hiệu lực", "2026-11-01", 16),
    ], gw);
    expect(merged.map((e) => e.id)).toEqual(["fomc:2026-10-28", "s1", "release:GSO:2026-11-06"]);
    expect(merged.find((e) => e.id === "s1")?.kind).toBe("policy");
  });

  it("Gateway lỗi -> dùng lịch cũ của engine xúc tác", () => {
    const merged = mergeMacroCalendar([cat("vn-pmi", "S&P Global cong bo PMI san xuat Viet Nam", "2026-11-02", 17)], null);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("release");
  });

  it("nhận diện loại đã phủ, không phân biệt dấu", () => {
    expect(isCoveredByGateway("GSO công bố CPI & số liệu xuất nhập khẩu")).toBe(true);
    expect(isCoveredByGateway("Thông tư mới về room ngoại")).toBe(false);
    expect(foldVi("Ngân hàng")).toBe("NGAN HANG");
  });
});
