// QUANTA UI v2 U0 (28/11/2026): cổng chặn tái phát hệ giao diện cũ — nợ giao diện chỉ được GIẢM (scripts/ui-lint-budget.json).
// Tăng nợ (VD thêm text-[#F5CE72], Space Grotesk, chữ < 10px, gradient) -> bài này fail. Giảm nợ -> chạy `node scripts/ui-lint.mjs --update`.
import { describe, expect, it } from "vitest";
import budgetDoc from "../../scripts/ui-lint-budget.json";
import { lintText, overBudget, scanUi, UI_RULES } from "../../scripts/ui-lint.mjs";

describe("ui-lint (QUANTA UI v2)", () => {
  it("nhận đúng dấu vết hệ cũ; bỏ dòng có ui-exempt / sau ui-exempt-next-line", () => {
    const c = lintText([
      '<b className="text-[#F5CE72] uppercase tracking-wide">A</b>',
      ".x { color: var(--gold-bright); font-family: var(--font-display); background: linear-gradient(1deg,#000,#fff); }",
      '<p className="text-[9px] bg-slate-900 text-[10px]" style={{ background: "#0E131F" }} />',
      '<i className="text-[#E8B84B]" /> {/* ui-exempt */}',
      "/* ui-exempt-next-line */",
      ".y { background: linear-gradient(1deg,#000,#fff); }",
    ].join("\n"));
    expect(c).toEqual({ "legacy-gold": 1, "legacy-gold-var": 1, "legacy-display-font": 1, "legacy-surface-hex": 1, "slate-surface": 1, "tiny-text": 1, "text-10px": 1, uppercase: 2, gradient: 1 });
  });

  it("toàn dự án không vượt ngân sách nợ giao diện (chỉ được giảm)", () => {
    const { totals } = scanUi();
    const over = overBudget(totals, budgetDoc.budget);
    expect(over, over.map((o) => `${o.id}: ${o.now} > ${o.budget} (${o.vi})`).join(" · ")).toEqual([]);
    expect(Object.keys(budgetDoc.budget).sort()).toEqual(UI_RULES.map((r) => r.id).sort());
  });
});
