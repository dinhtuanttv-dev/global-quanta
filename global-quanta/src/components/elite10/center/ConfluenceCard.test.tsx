// HL-v1: khối "Hợp lưu đa yếu tố" trong Hồ sơ 360° — ba tầng theo quy tắc chủ dự án, nhãn THĂM DÒ.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (ticker: string, values: Record<string, number | null>) => ({ ticker, values });
const panel = {
  date: "2026-11-11",
  rows: [
    row("VJC", { ls_v1: 3, sepa_state: 2, base_breakout: 3, structure_score: 7, rrg_quadrant: 1, stealth20: 1.2, foreign_net_buy: 1, fa_score: 20 }),
    row("MSB", { ls_v1: 2.9, sepa_state: 2, base_breakout: 3, rrg_quadrant: -2 }),
    ...Array.from({ length: 8 }, (_, i) => row(`X${i}`, { ls_v1: -i })),
  ],
};
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useElitePanel: () => ({ data: panel }) }));
const { default: ConfluenceCard } = await import("./ConfluenceCard");

const mount = async (ticker: string) => {
  const el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<ConfluenceCard ticker={ticker} />); });
  return el;
};
const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";

describe("ConfluenceCard (HL-v1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("mã đạt tầng 1, ngành Cải thiện = ủng hộ: hạng 1, ba tầng và ghi chú bằng chứng trung thực", async () => {
    const el = await mount("VJC");
    expect(q(el, "elite-confluence-rank")).toContain("1/10");
    expect(q(el, "elite-confluence-t1")).toMatch(/ĐẠT · 8\/10 điểm/);
    expect(q(el, "elite-confluence-t2")).toMatch(/Cải thiện.*ỦNG HỘ/);
    expect(q(el, "elite-confluence-t3")).toMatch(/\+1 điểm/); // Stealth 20 +1, khối ngoại +1, cơ bản −1
    expect(q(el, "elite-confluence-class")).toBe("Hợp lưu");
    expect(q(el, "elite-confluence-evidence")).toMatch(/THĂM DÒ.*Cải thiện −0,45%.*không phải khuyến nghị/);
  });
  it("ngành Tụt hậu = phản đối; mã không có trong bảng tín hiệu -> không hiện khối", async () => {
    const el = await mount("MSB");
    expect(q(el, "elite-confluence-t2")).toMatch(/Tụt hậu.*PHẢN ĐỐI/);
    expect(q(el, "elite-confluence-class")).toBe("Dẫn dắt · ngành phản đối");
    expect((await mount("ZZZ")).querySelector('[data-testid="elite-confluence"]')).toBeNull();
  });
});
