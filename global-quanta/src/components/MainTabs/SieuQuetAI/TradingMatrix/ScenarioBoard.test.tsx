import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RiskChecklist, ScenarioBoard, SignalJournal } from "./ScenarioBoard";
import type { MatrixOverview, MatrixSignals, Scenario } from "../../../../hooks/useTradingMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement;
const render = async (n: React.ReactNode) => { el = document.createElement("div"); document.body.appendChild(el); await act(async () => createRoot(el).render(n)); };
afterEach(() => el?.remove());

const sc = (id: Scenario["id"], state: Scenario["state"], displayState: string): Scenario => ({
  id, title: `Tiêu đề ${id}`, meaning: "ý nghĩa", state, since: "2026-10-20", displayState, evidence: state === "CONFIRMED" ? ["VN-Index xu hướng tăng", "62% mã trên MA20"] : [],
  contradictions: ["biến động cao"], groups: {}, ruleVersion: "M3-r1", validation: { verdict: "INSUFFICIENT", summary: "Chưa đủ mẫu ngoài mẫu (9/12 đợt)", label: "THỰC NGHIỆM" },
});

describe("Trading Matrix M3", () => {
  it("SC3 chỉ có độ rộng rơi thì không gọi là cú sốc biến động", async () => {
    const d = { scope: { label: "Toàn sàn HOSE" }, neutral: { active: false, reasons: [] }, scenarios: [{ ...sc("SC3", "WATCH", "Theo dõi"), title: "Cú sốc biến động", groups: { volatility: false, breadth: true } }] } as unknown as MatrixOverview;
    await render(<ScenarioBoard d={d} />);
    expect(el.textContent).toContain("Độ rộng rơi nhanh");
    expect(el.textContent).not.toContain("Cú sốc biến động");
  });

  it("kịch bản: đủ điều kiện quy tắc (không gọi Xác nhận khi chưa đạt), bằng chứng ✓ / mâu thuẫn ✗, kết quả kiểm định, chuyển pha", async () => {
    const d = { scope: { label: "Toàn sàn HOSE" }, scenarios: [sc("SC1", "CONFIRMED", "Đủ điều kiện quy tắc"), sc("SC2", "WATCH", "Theo dõi"), sc("SC3", "INACTIVE", "Không hoạt động")], neutral: { active: false, reasons: [] } } as unknown as MatrixOverview;
    await render(<ScenarioBoard d={d} />);
    const t = el.textContent ?? "";
    expect(t).toContain("◉ Đủ điều kiện quy tắc");
    expect(t).not.toContain("Xác nhận");
    expect(t).toContain("✓ VN-Index xu hướng tăng");
    expect(t).toContain("✗ biến động cao");
    expect(t).not.toContain("Kiểm định:");
    expect(t).not.toContain("THỰC NGHIỆM");
    expect(el.querySelector("[data-testid=mx-scenario-SC0]")?.textContent).toContain("Không áp dụng");
  });

  it("cờ rủi ro: trạng thái bằng chữ + ký hiệu, nguồn chưa có ghi rõ, kèm điều kiện bật / tắt; sổ tín hiệu tách lịch sử và thực tế", async () => {
    await render(<RiskChecklist flags={[
      { id: "RF3", title: "Chỉ số vs độ rộng phân kỳ", severity: "CAUTION", status: "ON", trigger: "A", close: "B", evidence: ["VN-Index +1%"], validation: "ngược với kỳ vọng", label: "THỰC NGHIỆM" },
      { id: "RF1", title: "Tin tức", severity: "INFO", status: "UNAVAILABLE", detail: "Nguồn lỗi", label: "CHƯA CÓ NGUỒN" },
      { id: "RF5", title: "Kế hoạch", severity: "INFO", status: "CHECKLIST", detail: "ghi mức vô hiệu", label: "QUY TRÌNH" },
    ]} />);
    const t = el.textContent ?? "";
    expect(t).toContain("Cờ cần xem xét");
    expect(t).toContain("Đang bật"); expect(t).toContain("Chưa có nguồn"); expect(t).toContain("Tự kiểm tra");
    expect(t).not.toContain("Bật khi");
    el.remove();
    const data: MatrixSignals = { version: "v", scope: "VNINDEX", ruleVersion: "M3-r1", note: "Chỉ tính khi đủ kỳ hạn.", recent: [{ scenario: "SC1", date: "2026-10-21", state: "CONFIRMED", evidence: [], health: "LIVE" }],
      live: { SC1: { "10": { n: 0, meanExcess: null } } },
      validation: { prereg: "p", verdicts: { SC1: "INSUFFICIENT", SC2: "FAIL", SC3: "INSUFFICIENT" }, summary: {}, stats: { SC2: { episodes: { IS: 9, OOS: 13 }, IS: { n: 9, mean: 1.3, ci: null }, OOS: { n: 13, mean: 1.42, ci: [-0.9, 3.9] } } } } };
    await render(<SignalJournal data={data} />);
    expect(el.textContent).toContain("13 đợt · +1,42%");
    expect(el.textContent).toContain("chưa có");
    expect(el.textContent).toContain("SC1 → CONFIRMED");
  });
});
