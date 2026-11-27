// A2–A6 — Command Deck render trên DỮ LIỆU THẬT phiên 18/11/2026: thanh lệnh, 4 đồng hồ, Hôm nay, radar ngưỡng bán, phễu, bảng danh mục nâng cấp,
// Không gian quy tắc 2D/3D, hàng chờ dạng thẻ, tường bằng chứng; nhãn trung thực; nguồn thiếu không làm vỡ bảng.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import fixture from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const REG = { version: "ER-v1", entries: [
  { id: "PZ", layer: "Vị trí giá PZ-v2", test: "PZ-r2", verdict: "KHÔNG ĐẠT", detail: "1,1%/năm so với 5,1%/năm", src: "research/hl-r2-pz-r1 · f32f2ae", ranAt: "2026-11-18" },
  { id: "HL", layer: "Quy tắc chọn", test: "HL-r2", verdict: "MỘT PHẦN", detail: "trong mẫu đạt, ngoài mẫu không", src: "bf30605", ranAt: "2026-11-14" },
] };
let deck: { risk: unknown; panel: unknown; registry: unknown } = { risk: fixture.risk, panel: fixture.panel, registry: REG };
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: deck.risk }), useDeckPanel: () => ({ data: deck.panel }), useEvidenceRegistry: () => ({ data: deck.registry }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: fixture.world.regime } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: null, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("../center/CashGateCard", () => ({ default: () => null }));
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: null }) }));
import EliteHlBoard from "../center/EliteHlBoard";
// QĐ-R2 (20/11/2026): "Bằng chứng của từng lớp" chuyển sang tab 4 — render thêm đúng khối đó với cùng dữ liệu.
import EvidenceWall from "./EvidenceWall";
const Wall = () => <EvidenceWall ledger={d.ledgerSummary} registry={deck.registry as never} k0Note={d.hl!.k0?.noteVi ?? null} />;

const d = fixture.decision as unknown as EliteDecision;
const text = (id: string) => screen.getByTestId(id).textContent ?? "";
afterEach(() => { cleanup(); deck = { risk: fixture.risk, panel: fixture.panel, registry: REG }; });

describe("Command Deck · dữ liệu thật 18/11", () => {
  it("thanh lệnh, 4 đồng hồ, dải Hôm nay: số đúng nguồn, nhãn đúng định nghĩa", () => {
    window.localStorage.setItem("gq.hl.layers.v1", JSON.stringify({ pulse: false })); // NHỊP QUYẾT ĐỊNH: kiểm dải "Hôm nay" cũ -> lớp pulse tắt (KP8)
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    window.localStorage.removeItem("gq.hl.layers.v1");
    expect(text("elite-label")).toBe("THĂM DÒ"); expect(text("deck-live")).toBe("Phiên mới nhất");
    expect(text("hl-kpi-market")).toMatch(/Thị trường yếu.*Độ rộng 22% mã trên MA20/);
    expect(text("hl-context-global")).toMatch(/VIX 24,62.*Căng thẳng/);
    expect(text("hl-kpi-invested")).toMatch(/72,4%.*Chính 67,1%.*Chạy lãi 5,3%.*Tiền mặt 27,7%/);
    expect(text("deck-risk")).toMatch(/250 phiên.*14,8%.*VaR 95% 1 phiên \(lịch sử\)1,51%.*Beta với VN-Index0,61.*Số mã hiệu dụng6,3/);
    expect(text("hl-kpi-rebalance")).toMatch(/Chỉ xét ra/); expect(text("hl-kpi-names")).toMatch(/7 \/ 10 mã · giữ nguyên 7 mã/);
    expect(text("deck-pz-counts")).toMatch(/Vị trí giá \(37 mã\): Vùng mua 15 · Trong nền 8/);
    expect(screen.queryByTestId("deck-invariants")).toBeNull();
  });

  it("radar ngưỡng bán + phễu + bảng danh mục nâng cấp (rủi ro Euler, dải biến động)", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    // 27/11: lớp cockpit (mặc định bật) gộp radar vào bảng "Ngưỡng bán · 4 điều kiện"; HSG vẫn đứng đầu, sát ngưỡng LS.
    expect(screen.queryByTestId("deck-exit-radar")).toBeNull();
    const first = screen.getByTestId("exit-triggers").querySelector("tbody tr")!;
    expect(first.getAttribute("data-testid")).toBe("exit-trig-HSG"); expect(screen.getByTestId("exit-trig-ls-HSG").getAttribute("data-level")).toBe("NEAR");
    expect(Number(screen.getByTestId("hl-funnel-0").getAttribute("data-n"))).toBe(279);
    expect(text("hl-risk-VPL")).toMatch(/rủi ro 29% Euler/); expect(text("hl-risk-VIC")).toMatch(/rủi ro 16% Euler/);
    expect(screen.queryByTestId("hl-risk-VCP")).toBeNull(); // VCP ở làn chạy lãi -> bảng Theo dõi chờ nền
    expect(screen.getByTestId("hl-corridor-HSG").getAttribute("aria-label")).toMatch(/Từ lúc vào −6,8%/);
  });

  it("Không gian quy tắc: 272/279 mã, đếm khớp phễu, 7 mã đang giữ, vạch ngưỡng bán đúng hằng số; bảng dự phòng cho trình đọc màn hình", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(text("deck-space")).toMatch(/Không gian quy tắc Elite HL · 272\/279 mã có LS-v1/);
    expect(text("deck-space-counts")).toBe("· 35 mã đạt tầng 1 · 12 đạt Hợp lưu · 7 đang giữ");
    expect(screen.getByTestId("deck-space-2d").querySelectorAll('circle[data-role="held"]').length).toBe(7);
    expect(screen.getByTestId("deck-space-exit-line").getAttribute("data-ls")).toBe("60");
    expect(screen.getByTestId("deck-space-3d").getAttribute("aria-label")).toMatch(/khối vàng = vùng được chọn/);
    expect(screen.queryByTestId("deck-space-mismatch")).toBeNull();
    expect(screen.getByTestId("deck-space").querySelector("table.sr-only tbody")!.children.length).toBe(13);
  });

  it("hàng chờ dạng thẻ: điều kiện ✓/✗ đúng ngưỡng; tường bằng chứng công bố cả KHÔNG ĐẠT; không chuỗi cấm", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    render(<Wall />);
    expect(screen.queryByTestId("elite-hl-board")!.querySelector('[data-testid="deck-evidence"]')).toBeNull(); // không còn trên bảng
    expect(text("hl-queue-VPI")).toMatch(/✓ LS 94.*✓ TA 4\/7.*✓ Cải thiện.*✓ 106,9 tỷ|✓ LS 94/);
    expect(text("deck-evidence-ledger")).toMatch(/THĂM DÒ.*Sổ theo dõi tiến Elite HL/);
    expect(text("deck-evidence-PZ")).toMatch(/PZ-r2 · KHÔNG ĐẠT/); expect(text("deck-evidence-HL")).toMatch(/HL-r2 · MỘT PHẦN/);
    const all = text("elite-hl-board");
    for (const bad of [/mua ngay/i, /bất khả chiến bại/i, /chắc thắng/i, /ĐẠT TIÊU CHÍ ĐĂNG KÝ TRƯỚC/]) { expect(all).not.toMatch(bad); expect(text("deck-evidence")).not.toMatch(bad); }
  });

  it("nguồn phụ thiếu (rủi ro, bảng tín hiệu, sổ bằng chứng) -> khối tự ẩn / ghi rõ, bảng không vỡ", () => {
    deck = { risk: null, panel: null, registry: null };
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    render(<Wall />);
    expect(text("deck-risk")).toMatch(/Chưa tính được rủi ro danh mục/);
    expect(screen.queryByTestId("deck-space")).toBeNull();
    expect(text("deck-evidence-missing")).toMatch(/Chưa tải được sổ bằng chứng/);
    expect(text("hl-risk-VPL")).toMatch(/rủi ro ~11% \(thô\)/);
  });
});
