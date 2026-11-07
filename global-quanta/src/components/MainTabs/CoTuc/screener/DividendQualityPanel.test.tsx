import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import DividendQualityPanel from "./DividendQualityPanel";
import { dsToStock, type DqView, type DsRow } from "../../../../lib/cotuc/dsStocks";
import { DEFAULT_FILTER, filterVerdict } from "../../../../lib/quant-cotuc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const dq: DqView = {
  version: "DQ-v1", yield: { fy: 0.2424, fyYear: 2025, median3: 0.0909, ttm: 0.3333, catchUp: true, company: 0.21 },
  company: { years: 18, payout5: 0.2875, fcfCover5: 2.97, streak: 5, cuts10: 3, divCv5: 0.4, lossYears10: 0, lastYear: 2025, lastD: 2.1e12, lastE: 3.2e12 },
  lintner: { ok: true, n: 17, from: 2009, to: 2025, speed: 0.74, targetPayout: 0.23, r2: 0.38, reason: null }, lintnerNextD: 1.9e12, lintnerNextYield: 0.15,
  checks: [{ id: "payout", label: "Chi trả 5 năm ≤ 80% lợi nhuận", pass: true }, { id: "growth", label: "LNST 12 tháng không giảm", pass: false }, { id: "debt", label: "Nợ ròng / EBITDA ≤ 2,5", pass: null }], checksPassed: 1, checksKnown: 2,
  risk: { vol1y: 0.47, mdd1y: -0.62, ret1y: -0.56, beta: 0.63, sessions: 252 }, trap: ["giá giảm 56% trong 1 năm"],
};
describe("BL2 Độ bền cổ tức & rủi ro", () => {
  it("hiển thị lợi suất chuẩn hoá, cờ trả dồn, tiêu chí, Lintner, rủi ro, cờ bẫy", async () => {
    const el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<DividendQualityPanel dq={dq} />); });
    const t = el.textContent!;
    expect(t).toContain("24,2%"); expect(t).toContain("có trả dồn nhiều năm tài chính");
    expect(el.querySelector('[data-testid="dq-trap"]')!.textContent).toContain("giá giảm 56%");
    expect(el.querySelector('[data-testid="dq-checks"]')!.textContent).toContain("✓ Chi trả 5 năm"); expect(t).toContain("đạt 1/2");
    expect(el.querySelector('[data-testid="dq-lintner"]')!.textContent).toContain("Tỷ lệ chi trả mục tiêu 23%");
    expect(el.querySelector('[data-testid="dq-risk"]')!.textContent).toContain("-62%");
    await act(async () => { createRoot(el).render(<DividendQualityPanel dq={null} />); });
  });
  it("bộ lọc Ẩn bẫy lợi suất", () => {
    const base = { t: "DGC", name: "DGC", sector: null, sectorGroup: null, price: 33000, changePct: null, liquidity20: null, mcap: null, trend: null, ma50: null, ma200: null, rsi14: null, rsRating: null, yieldGross: 0.33, yieldNet: null, div: null, fund: null, ex: null } as DsRow;
    const s = dsToStock({ ...base, dq });
    expect(filterVerdict(s, { ...DEFAULT_FILTER, hideStaleEvents: false })).toBe("PASS");
    expect(filterVerdict(s, { ...DEFAULT_FILTER, hideStaleEvents: false, hideTraps: true })).toBe("FAIL");
    expect(filterVerdict(dsToStock({ ...base, dq: { ...dq, trap: null } }), { ...DEFAULT_FILTER, hideStaleEvents: false, hideTraps: true })).toBe("PASS");
  });
});
