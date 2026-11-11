// P2 (FN-v1): trường số có trạng thái + bộ lọc logic ba giá trị (Kleene) — không còn "điền 0" làm đạt / loại oan.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER, DIVIDEND_STOCKS, detectRiskFlags, explainFilter, fieldStatus, fieldValue, filterAndSortStocks, filterDetail, filterVerdict,
  missingSummary, type DividendStock, type FieldKey, type FieldStatus,
} from "../quant-cotuc";
import { fieldStatuses, type DsRow } from "./dsStocks";

const base = DIVIDEND_STOCKS.find((s) => s.ticker === "FPT")!;
const OK: Record<FieldKey, FieldStatus> = { yield: "OK", pe: "OK", roe: "OK", de: "OK", fscore: "OK", payout: "OK", growth: "OK" };
const st = (over: Partial<DividendStock>, fields: Partial<Record<FieldKey, FieldStatus>> = {}): DividendStock =>
  ({ ...base, price: 50000, dividendYield: 6, exDividendDate: "", paymentDate: "", agmDate: "", fundamentalsReal: true, ...over, fields: { ...OK, ...fields } });

describe("fieldStatuses (dòng DS-v1 -> trạng thái)", () => {
  const fund = (o: Record<string, unknown>) => ({ quarter: "Q3/2026", tpl: "corp", pe: null, pb: null, roe: 0.2, de: 0.4, interestCover: null, netDebtEbitda: null, netMargin: null, growthTtm: 0.1, npatYoY: null, epsTtm: 5000, payout: 0.4, fcfCover: null, cfoToNpat: null, accrual: null, f: 7, m: null, mFlag: null, z: null, zZone: null, flags: [], ...o });
  const row = (f: Record<string, unknown> | null) => ({ t: "X", fund: f ? fund(f) : null }) as unknown as DsRow;
  it("ngân hàng: F-Score / Nợ/VCSH KHÔNG ÁP DỤNG (không phải thiếu, không phải 0)", () => {
    const s = fieldStatuses(row({ tpl: "bank", f: null, de: null, na: ["fcfCover", "f", "de"] }), 20000);
    expect(s.fscore).toBe("NA"); expect(s.de).toBe("NA"); expect(s.pe).toBe("OK"); expect(s.roe).toBe("OK");
  });
  it("EPS ≤ 0 -> P/E LỖ (số thật); thiếu ROE -> THIẾU; thiếu giá -> lợi suất THIẾU; F-Score 0 là số thật", () => {
    const s = fieldStatuses(row({ epsTtm: -274, roe: null, f: 0 }), 0);
    expect(s.pe).toBe("MISSING"); // chưa có giá: P/E chưa tính được
    expect(fieldStatuses(row({ epsTtm: -274 }), 9000).pe).toBe("LOSS");
    expect(s.roe).toBe("MISSING"); expect(s.yield).toBe("MISSING"); expect(s.fscore).toBe("OK");
    expect(fieldStatuses(row(null), 9000)).toMatchObject({ pe: "MISSING", roe: "MISSING", de: "MISSING", fscore: "MISSING", payout: "MISSING", growth: "MISSING" });
  });
});

describe("filterDetail — logic ba giá trị", () => {
  const F = { ...DEFAULT_FILTER, minRoe: 12, maxPe: 15, minFscore: 5, hideStaleEvents: false };
  it("một tiêu chí KHÔNG ĐẠT thắng mọi tiêu chí CHƯA BIẾT (Kleene AND)", () => {
    expect(filterVerdict(st({ roe: 8, pe: 9, fscore: 7 }, { fscore: "MISSING" }), F)).toBe("FAIL");
    expect(filterVerdict(st({ roe: 20, pe: 9 }, { fscore: "MISSING" }), F)).toBe("MISSING_DATA");
    expect(filterVerdict(st({ roe: 20, pe: 9, fscore: 7 }), F)).toBe("PASS");
  });
  it("P/E lỗ là KHÔNG ĐẠT ngưỡng P/E (trước P2: bị xếp nhầm vào thiếu số liệu)", () => {
    expect(filterVerdict(st({ roe: 20, pe: 0, fscore: 7 }, { pe: "LOSS" }), F)).toBe("FAIL");
  });
  it("F-Score 0 thật -> KHÔNG ĐẠT (trước P2: 0 bị coi là chưa có)", () => {
    expect(filterVerdict(st({ roe: 20, pe: 9, fscore: 0 }), F)).toBe("FAIL");
  });
  it("ngân hàng: F-Score không áp dụng -> CHƯA BIẾT (lý do NA); Nợ/VCSH không áp dụng -> bỏ qua tiêu chí", () => {
    const bank = st({ sector: "Ngân hàng", roe: 17, pe: 8, debtEquity: 0 }, { fscore: "NA", de: "NA" });
    expect(filterDetail(bank, F)).toEqual({ verdict: "MISSING_DATA", unknown: [{ field: "fscore", why: "NA" }] });
    expect(filterVerdict(bank, { ...F, minFscore: 0, maxDebt: 0.5 })).toBe("PASS");
  });
  it("Nợ/VCSH thiếu (trước P2: 0 -> lọt ngưỡng) -> CHƯA BIẾT", () => {
    expect(filterVerdict(st({ debtEquity: 0 }, { de: "MISSING" }), { ...DEFAULT_FILTER, maxDebt: 0.5 })).toBe("MISSING_DATA");
  });
  it("thiếu giá -> lợi suất CHƯA BIẾT (trước P2: lợi suất 0 -> loại)", () => {
    expect(filterVerdict(st({ price: 0, dividendYield: 0 }, { yield: "MISSING" }), { ...DEFAULT_FILTER, minYield: 5 })).toBe("MISSING_DATA");
  });
});

describe("explainFilter / missingSummary / showUnknown / sắp xếp", () => {
  const F = { ...DEFAULT_FILTER, minRoe: 12, minFscore: 5, hideStaleEvents: false };
  const rows = [
    st({ ticker: "AAA", roe: 20, fscore: 7 }),
    st({ ticker: "BBB", roe: 0, fscore: 7 }, { roe: "MISSING" }),
    st({ ticker: "VCB", sector: "Ngân hàng", roe: 18 }, { fscore: "NA" }),
    st({ ticker: "TCB", sector: "Ngân hàng", roe: 15 }, { fscore: "NA" }),
    st({ ticker: "CCC", roe: 5, fscore: 7 }),
  ];
  it("đếm thiếu số liệu theo trường + không áp dụng", () => {
    const e = explainFilter(rows, F);
    expect(e).toMatchObject({ pass: 1, fail: 1, missingData: 3, missingBy: { roe: 1 }, naBy: { fscore: 2 }, otherMissing: 0 });
    expect(missingSummary(e)).toBe("ROE 1 · F-Score không áp dụng 2");
  });
  it("showUnknown: hiện cả mã CHƯA BIẾT, vẫn loại mã KHÔNG ĐẠT", () => {
    expect(filterAndSortStocks(rows, F, "dividendYield", false).map((s) => s.ticker)).toEqual(["AAA"]);
    expect(filterAndSortStocks(rows, { ...F, showUnknown: true }, "dividendYield", false).map((s) => s.ticker).sort()).toEqual(["AAA", "BBB", "TCB", "VCB"]);
  });
  it("sắp xếp: trường chưa có số luôn xếp cuối, cả hai chiều", () => {
    const r = [st({ ticker: "A", roe: 10 }), st({ ticker: "N", roe: 0 }, { roe: "MISSING" }), st({ ticker: "B", roe: 20 })];
    expect(filterAndSortStocks(r, DEFAULT_FILTER, "roe", false).map((s) => s.ticker)).toEqual(["B", "A", "N"]);
    expect(filterAndSortStocks(r, DEFAULT_FILTER, "roe", true).map((s) => s.ticker)).toEqual(["A", "B", "N"]);
  });
});

describe("dòng nguồn cũ (chưa có `fields`) và cảnh báo rủi ro", () => {
  it("nguồn cũ suy theo cờ cũ", () => {
    const old = { ...base, fundamentalsReal: false } as DividendStock;
    expect(fieldStatus(old, "roe")).toBe("MISSING"); expect(fieldValue(old, "roe")).toBeNull();
    expect(fieldStatus({ ...base, sector: "Ngân hàng" }, "de")).toBe("NA");
  });
  it("thiếu tăng trưởng KHÔNG còn sinh cờ 'cổ tức quá cao so tăng trưởng' (trước P2: tăng trưởng 0 < 5)", () => {
    const s = st({ payoutRatio: 95, growth: 0, payoutReal: true, growthReal: false }, { growth: "MISSING" });
    expect(detectRiskFlags(s)).not.toContain("Cổ tức quá cao so tăng trưởng");
    expect(detectRiskFlags(st({ payoutRatio: 95, growth: 2, payoutReal: true, growthReal: true }))).toContain("Cổ tức quá cao so tăng trưởng");
  });
});
