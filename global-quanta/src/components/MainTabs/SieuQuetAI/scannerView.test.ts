import { describe, expect, it } from "vitest";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import { ariaSort, boardSession, depthShare, DEFAULT_VIEW, fitOf, fmtCompactVol, fmtKPrice, fmtPct, nextSort, parseViewPrefs, rangePos, sortItems } from "./scannerView";

const it_ = (ticker: string, smartScore: number | null, price: number | null = 1000) => ({ ticker, smartScore, price }) as SieuQuetStockItem;

describe("Sắp xếp chỉ đổi thứ tự hiển thị", () => {
  const list = [it_("VNM", 50), it_("FPT", 90), it_("ACB", null), it_("HPG", 70)];
  it("mặc định giữ nguyên thứ tự máy quét", () => {
    expect(sortItems(list, null)).toBe(list);
  });
  it("cột số: thiếu số luôn nằm cuối theo cả hai chiều; không đổi dữ liệu gốc", () => {
    expect(sortItems(list, { key: "smartScore", dir: "desc" }).map((i) => i.ticker)).toEqual(["FPT", "HPG", "VNM", "ACB"]);
    expect(sortItems(list, { key: "smartScore", dir: "asc" }).map((i) => i.ticker)).toEqual(["VNM", "HPG", "FPT", "ACB"]);
    expect(list.map((i) => i.ticker)).toEqual(["VNM", "FPT", "ACB", "HPG"]);
  });
  it("cột mã theo bảng chữ cái", () => {
    expect(sortItems(list, { key: "ticker", dir: "asc" }).map((i) => i.ticker)).toEqual(["ACB", "FPT", "HPG", "VNM"]);
  });
  it("bấm tiêu đề xoay vòng rồi về mặc định", () => {
    const a = nextSort(null, "smartScore");
    expect(a).toEqual({ key: "smartScore", dir: "desc" });
    const b = nextSort(a, "smartScore");
    expect(b).toEqual({ key: "smartScore", dir: "asc" });
    expect(nextSort(b, "smartScore")).toBeNull();
    expect(nextSort(null, "ticker")).toEqual({ key: "ticker", dir: "asc" });
    expect(ariaSort(a, "smartScore")).toBe("descending");
    expect(ariaSort(a, "price")).toBe("none");
  });
});

describe("Định dạng không đổi giá trị", () => {
  it("giá theo nghìn đồng, thiếu thì gạch ngang", () => {
    expect(fmtKPrice(148700)).toBe("148.70");
    expect(fmtKPrice(null)).toBe("—");
    expect(fmtKPrice(0)).toBe("—");
    expect(fmtPct(0.684)).toBe("+0.68%");
    expect(fmtPct(-4.11)).toBe("-4.11%");
  });
  it("khối lượng gọn", () => {
    expect(fmtCompactVol(17_644_300)).toBe("17.6M");
    expect(fmtCompactVol(1_130_600)).toBe("1.13M");
    expect(fmtCompactVol(267_200)).toBe("267K");
    expect(fmtCompactVol(900)).toBe("900");
    expect(fmtCompactVol(null)).toBe("");
  });
  it("thanh độ sâu và vị trí biên", () => {
    expect(depthShare(50, 200)).toBe(25);
    expect(depthShare(0, 200)).toBe(0);
    expect(rangePos(15, 10, 20)).toBe(50);
    expect(rangePos(15, 20, 20)).toBeNull();
    expect(rangePos(null, 10, 20)).toBeNull();
    expect(rangePos(25, 10, 20)).toBe(100);
  });
});

describe("Trạng thái phiên", () => {
  it("lấy phiên phổ biến nhất; ngoài phiên thì ghi ngày dữ liệu, không đoán", () => {
    const now = Date.parse("2026-11-02T03:00:00Z");
    const today = "2026-11-02T10:00:00+07:00";
    expect(boardSession({ A: { session: "LO", time: today }, B: { session: "LO", time: today }, C: { session: "ATC", time: today } } as never, now)).toEqual({ live: true, label: "Khớp lệnh liên tục" });
    expect(boardSession({ A: { session: "BREAK", time: today } } as never, now)).toEqual({ live: true, label: "Nghỉ trưa" });
    expect(boardSession({ A: { session: null, time: "2026-10-30T00:00:00+07:00" } } as never, now)).toEqual({ live: false, label: "Ngoài phiên · dữ liệu 30/10" });
    // Tin cuối phiên hôm trước, hoặc mã phiên lạ, không được báo là đang giao dịch.
    expect(boardSession({ A: { session: "LO", time: "2026-10-30T14:45:00+07:00" } } as never, now)).toEqual({ live: false, label: "Ngoài phiên · dữ liệu 30/10" });
    expect(boardSession({ A: { session: "C", time: today } } as never, now)).toEqual({ live: false, label: "Ngoài phiên · dữ liệu 02/11" });
    expect(boardSession({})).toBeNull();
  });
});

describe("Tuỳ chọn và bề rộng", () => {
  it("mặc định gọn, đủ 3 bước giá; dữ liệu hỏng về mặc định", () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_VIEW);
    expect(parseViewPrefs("{hỏng")).toEqual(DEFAULT_VIEW);
    expect(parseViewPrefs(JSON.stringify({ focus: true, density: "comfortable", levels: 1 }))).toEqual({ focus: true, density: "comfortable", levels: 1 });
    expect(parseViewPrefs(JSON.stringify({ levels: 7, density: "x" }))).toEqual(DEFAULT_VIEW);
  });
  it("mức chữ theo bề rộng", () => {
    expect(fitOf(1450, "board")).toBe("wide");
    expect(fitOf(1250, "board")).toBe("mid");
    expect(fitOf(956, "board")).toBe("tight");
    expect(fitOf(1450, "scanner")).toBe("wide");
    expect(fitOf(1100, "scanner")).toBe("mid");
    expect(fitOf(956, "scanner")).toBe("tight");
  });
});
