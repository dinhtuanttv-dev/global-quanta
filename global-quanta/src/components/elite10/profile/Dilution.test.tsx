// PX0 + PX-L — huy hiệu vòng đời đợt pha loãng, khối Hồ sơ (trục thời gian, lịch sử, độ trễ, PX-r1, sổ PX-L), lịch 10 phiên.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import type { DilutionPhase, PxR1 } from "../../../lib/elite10/decisionTypes";
import { buildHlCalendar } from "../../../lib/elite10/hlCalendar";

const pxR1: PxR1 = { verdict: "KHÔNG ĐẠT", ranAt: "2026-11-18", period: "01/2020–11/2026", n: 520, mean30: -0.0057, t: -0.65, median30: -0.0134, half1: -0.0154, half2: 0.0042, superShare: 0.0519, textVi: "PX-r1 (520 đợt pha loãng ≥ 10%, 2020–2026): không có ý nghĩa. Không có cổng." };
const post: DilutionPhase = { phase: "POST_EX", day: 5, listed: false, ex: "2026-11-11", cat: "STOCK", ratio: 10, record: "2026-11-12", disclosed: "2026-11-02", listing: "2026-12-21", listingBasis: "ESTIMATED_OWN", lag: 28, until: "2026-12-28", ownLag: 28, nOwn: 3 };
const pre: DilutionPhase = { ...post, phase: "PRE_EX", sessionsTo: 4, day: undefined, ex: "2026-11-24", listing: "2026-12-30", listingBasis: "ANNOUNCED", until: "2027-01-07" };
let dil: unknown = {
  version: "PX-v0", asOf: "2026-11-18", ticker: "BMI", pxR1, phase: post,
  ownLags: [{ ex: "2023-10-12", listing: "2023-11-30", lag: 35 }, { ex: "2024-10-03", listing: "2024-11-12", lag: 28 }, { ex: "2025-10-13", listing: "2025-11-18", lag: 26 }],
  marketLag: { lag: 27, n: 612, p25: 22, p75: 34 },
  history: [{ ex: "2025-10-13", cat: "STOCK", ratio: 13.5, listing: "2025-11-18", lag: 26, exDay: 0.021, x10: -0.012, x20: 0.004, x30: -0.031 }],
  historyNote: null, ledger: [],
};
vi.mock("../../../hooks/elite10/useEliteDilution", () => ({
  useEliteDilution: () => ({ data: dil, error: null, isLoading: false }),
  usePxLedger: () => ({ data: { version: "PX-v0", start: "2026-11-19", updatedAt: "2026-11-18", label: "THĂM DÒ", pxR1, summary: { registered: 3, listed: 0, 10: { n: 0 }, 20: { n: 0 }, 30: { n: 0 } }, entries: [] } }),
}));
import DilutionBadge, { dilutionText } from "../center/DilutionBadge";
import DilutionProfileBlock from "./DilutionProfileBlock";

afterEach(() => cleanup());
const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("PX0 — huy hiệu", () => {
  it("SẮP / HẬU GDKHQ / CP mới đã giao dịch; ngày ước tính có dấu ≈; chú thích nêu PX-r1 và 'chỉ hiển thị'", () => {
    expect(dilutionText(pre).short).toBe("SẮP GDKHQ · CP 10% · 4 phiên");
    expect(dilutionText(post).short).toBe("HẬU GDKHQ · CP 10% · phiên 5/≈28");
    expect(dilutionText(post).long).toMatch(/≈21\/12 — ước tính theo độ trễ niêm yết các đợt trước của chính mã \(3 đợt trước\)/);
    expect(dilutionText({ ...post, listed: true }).short).toBe("CP MỚI ĐÃ GIAO DỊCH · 21/12");
    render(<DilutionBadge p={post} pxR1={pxR1} testId="b" />);
    const b = screen.getByTestId("b"); expect(b.getAttribute("data-phase")).toBe("POST_EX");
    expect(b.getAttribute("title")).toMatch(/PX-r1.*Không có cổng.*\nChỉ hiển thị — không đổi danh mục\./s);
    cleanup(); render(<DilutionBadge p={null} />); expect(document.body.textContent).toBe("");
  });
});

describe("PX0 — Hồ sơ · Vòng đời đợt pha loãng", () => {
  it("pha hiện tại + trục thời gian, độ trễ của mã và thị trường, lịch sử, PX-r1, sổ PX-L", () => {
    render(<DilutionProfileBlock ticker="BMI" />);
    expect(text("px-current")).toMatch(/HẬU GDKHQ · CP 10% · phiên 5\/≈28/);
    expect(screen.getByTestId("px-lifecycle").getAttribute("aria-label")).toBe("GDKHQ 11/11/2026, ĐKCC 12/11/2026, CP mới GD ≈ 21/12/2026, Hết theo dõi 28/12/2026");
    // Chú giải tách khỏi trục (không chồng chữ khi hai mốc cách nhau 1 phiên).
    expect([...screen.getByTestId("px-lifecycle-legend").querySelectorAll("li")].map((li) => li.textContent)).toEqual(["1 GDKHQ 11/11", "2 ĐKCC 12/11", "3 CP mới GD ≈ 21/12", "4 Hết theo dõi 28/12", "▼ Hôm nay 18/11"]);
    expect(text("px-lags")).toMatch(/của BMI 35 · 28 · 26 phiên \(3 đợt gần nhất\).*trung vị 27 phiên \(25–75%: 22–34, 612 đợt\)/);
    expect(text("px-history")).toMatch(/13\/10\/2025.*Cổ tức CP 13,5%.*18\/11\/2025 \(26 phiên\).*\+2,1%.*−1,2%.*\+0,4%.*−3,1%/);
    expect(text("px-evidence")).toMatch(/nửa 06\/2023–2026 \+0,4%/);
    expect(text("px-ledger")).toMatch(/từ 19\/11\/2026\): 3 đợt đã ghi trước khi có kết quả · chưa có đợt nào đủ 30 phiên/);
    expect(text("px-profile")).toMatch(/KHÔNG ĐẠT/); expect(text("px-profile")).not.toMatch(/Mua ngay|cấm mua/i);
  });
  it("không có đợt -> câu rõ ràng", () => {
    dil = { ...(dil as object), phase: { phase: "NONE" }, ownLags: [], history: [] };
    render(<DilutionProfileBlock ticker="VIC" />); expect(text("px-none")).toMatch(/VIC không có đợt pha loãng/); expect(text("px-lags")).toMatch(/VIC chưa có đợt nào đã niêm yết/);
  });
});

describe("PX0 — lịch 10 phiên", () => {
  it("ngày cổ phiếu mới giao dịch trong cửa sổ được thêm, ghi rõ ước tính; ngoài cửa sổ / đã giao dịch thì không", () => {
    const sessions = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02"];
    const cal = buildHlCalendar({ asOf: "2026-11-18", sessions, portfolio: ["BMI"], queue: ["AAA", "BBB"], profiles: new Map(), timeline: null,
      dilution: { BMI: { ...post, listing: "2026-11-26" }, AAA: { ...post, listing: "2026-12-21" }, BBB: { ...post, listing: "2026-11-25", listed: true } } });
    expect(cal.items.map((i) => `${i.date} ${i.ticker} ${i.kind} ${i.basis}`)).toEqual(["2026-11-26 BMI NEW_SHARES EXPECTED"]);
    expect(cal.items[0].label).toBe("Cổ phiếu mới (cổ tức CP 10%) giao dịch được"); expect(cal.items[0].detail).toMatch(/GDKHQ 11\/11 · ước tính theo các đợt trước của mã/);
  });
});
