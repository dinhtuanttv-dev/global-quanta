import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HlLedger } from "../../../hooks/elite10/useHlLedger";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const g = (labelVi: string, days: number, meanEx: number | null, t: number | null) => ({ labelVi, days, avgSize: 10, meanEx, posShare: 0.5, t, verdict: "CHƯA ĐỦ MẪU" });
const base: HlLedger = { version: "HL-v1", start: "2026-11-12", updatedAt: null, days: 3, scoredDays: 0, from: "2026-11-12", to: "2026-11-16", rule: { horizon: 20, minDays: 120 }, label: "THĂM DÒ", noteVi: "ghi chú", latest: null,
  groups: { sel: g("Hợp lưu", 0, null, null), strong: g("Hợp lưu mạnh", 0, null, null), lead: g("Dẫn dắt", 0, null, null), impr: g("Cải thiện", 0, null, null), against: g("Phản đối", 0, null, null) } };
let current: HlLedger | null = base;
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: current }) }));
const { default: HlLedgerNote } = await import("./HlLedgerNote");
const mount = async () => { const el = document.createElement("div"); document.body.appendChild(el); await act(async () => { createRoot(el).render(<HlLedgerNote />); }); return el; };

describe("HlLedgerNote", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("chưa có phiên được chấm: nói rõ đang chờ, không bịa số", async () => {
    current = base; const t = (await mount()).textContent ?? "";
    expect(t).toContain("từ 12/11/2026"); expect(t).toContain("đã ghi 3 phiên"); expect(t).toMatch(/chưa có phiên nào đủ 20 phiên/); expect(t).toContain("THĂM DÒ");
  });
  it("đã chấm: hiện vượt trội từng nhóm, t và trạng thái mẫu; không có sổ -> không hiện", async () => {
    current = { ...base, days: 40, scoredDays: 19, groups: { ...base.groups, sel: g("Hợp lưu", 19, 0.0123, 0.8), impr: g("Cải thiện", 19, -0.004, null) } };
    const t = (await mount()).textContent ?? "";
    expect(t).toContain("Hợp lưu +1,23% (t 0,8)"); expect(t).toContain("Cải thiện -0,40%"); expect(t).toContain("CHƯA ĐỦ MẪU (cần 120 phiên đã chấm)");
    current = null; expect((await mount()).querySelector('[data-testid="hl-ledger"]')).toBeNull();
  });
});
