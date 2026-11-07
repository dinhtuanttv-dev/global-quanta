import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import FactorPanel, { FmBadge } from "./FactorPanel";
import type { FmView } from "../../../../lib/cotuc/dsStocks";
import { filterAndSortStocks, DEFAULT_FILTER, DIVIDEND_STOCKS } from "../../../../lib/quant-cotuc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fm: FmView = { version: "FM-v1", label: "MÔ TẢ", score: 0.8, groups: { Y: 1.2, D: -0.4, G: null, Q: 0.6, V: 0.9, R: 1.1 }, rank: 7, of: 255, quintile: 5, pct: 0.976 };
describe("BL3 mô hình nhân tố", () => {
  it("huy hiệu hạng + bảng 6 nhóm, nhãn MÔ TẢ khi kiểm định chưa đạt", async () => {
    const el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<><FmBadge fm={fm} /><FactorPanel fm={fm} /></>); });
    expect(el.querySelector('[data-testid="fm-badge"]')!.textContent).toBe("Hạng 98 · Q5");
    expect(el.querySelector('[data-testid="fm-panel"]')!.textContent).toContain("hạng 7/255");
    expect(el.querySelector('[data-testid="fm-panel"]')!.textContent).toContain("MÔ TẢ");
    expect(el.querySelector('[data-testid="fm-g-G"]')!.textContent).toContain("—");
    expect(el.querySelector('[data-testid="fm-g-D"]')!.textContent).toContain("-0,4");
  });
  it("sắp xếp cột Hạng NT theo phân vị FM-v1; mã chưa có điểm xếp cuối", () => {
    const base = DIVIDEND_STOCKS.slice(0, 3).map((s, i) => ({ ...s, dividendYield: 1, fm: i === 2 ? null : { ...fm, pct: i === 0 ? 0.2 : 0.9 } }));
    const out = filterAndSortStocks(base, { ...DEFAULT_FILTER, hideStaleEvents: false }, "score", false);
    expect(out.map((s) => s.ticker)).toEqual([base[1].ticker, base[0].ticker, base[2].ticker]);
  });
});
