// HS360-v3 H2 (27/11/2026): góc "Tín hiệu" — định dạng theo đơn vị (KQKD dạng %, CAN SLIM nhãn), phân vị toàn TT / ngành, bậc E2,
// SQS + xu hướng + IC theo chế độ hôm nay (EV-4), lý do ô trống, lọc theo tab / bất lợi / bậc A–B, thứ tự bậc → SQS.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EvidenceSignal, PanelTicker } from "../../../lib/elite10/decisionTypes";
import type { EvolutionSignal } from "../../../lib/elite10/evolutionTypes";

vi.mock("./DecisionBoard", () => ({ TierChip: ({ tier }: { tier: string }) => <span>Bậc {tier}</span> }));
import SignalTableView, { formatSignalValue, signalRows } from "./SignalTableView";

const spec = (id: string, tab: string, unit: string, tier: "A" | "B" | "C") => ({ id, tab, labelVi: id, unit, level: "stock" as const, tier });
const panel: PanelTicker = {
  date: "2026-11-30", ticker: "NAF", icb: { l2: "3500" }, sector: "Thực phẩm", missingSources: ["researchFeatures"],
  signals: [spec("stealth20", "Siêu quét AI", "z", "A"), spec("kq_nowcast", "Cơ bản", "tỷ lệ", "B"), spec("camslim_cup", "TA VN-Index", "bậc", "B"), spec("smart_score", "Siêu quét AI", "0–100", "C")],
  values: { stealth20: null, kq_nowcast: 0.728, camslim_cup: 2, smart_score: 20 },
};
const rows = Array.from({ length: 20 }, (_, i) => ({ ticker: i === 0 ? "NAF" : `T${i}`, icb: { l2: i < 8 ? "3500" : "8300" }, values: { kq_nowcast: i === 0 ? 0.728 : i / 100, smart_score: i === 0 ? 20 : 10 + i * 5, camslim_cup: i === 0 ? 2 : 0 } }));
const ev = (id: string, tier: "A" | "B" | "C") => ({ id, tier, mainH: 5, byH: { 5: { n: 200, mean: 0.02, t: 2.1, stable: true } } } as unknown as EvidenceSignal);
const evo = (id: string, sqs: number, tag: EvolutionSignal["trendTag"]) => ({ id, sqs, trendTag: tag, regimeIc: { UPTREND: { n: 5, mean: 0.1, t: 1 }, SIDEWAY: { n: 0, mean: null, t: null }, DOWNTREND: { n: 74, mean: 0.021, t: 2 } } } as unknown as EvolutionSignal);
const evOf = new Map([["stealth20", ev("stealth20", "A")], ["smart_score", ev("smart_score", "C")]]);
const evoOf = new Map([["stealth20", evo("stealth20", 96, "PROVEN_LEADER")], ["smart_score", evo("smart_score", 58, "NEUTRAL")]]);

afterEach(cleanup);

describe("SignalTableView", () => {
  it("định dạng theo đơn vị", () => {
    expect(formatSignalValue("tỷ lệ", 0.728)).toBe("+72,8%");
    expect(formatSignalValue("z", -1.234)).toBe("−1,23");
    expect(formatSignalValue("xác suất", 0.62)).toBe("62%");
    expect(formatSignalValue("0–100", 87.4)).toBe("87");
    expect(formatSignalValue("đcb/phiên", 3.47)).toBe("+3,47 đcb");
    expect(formatSignalValue("z", null)).toBe("—");
  });

  it("dòng: thứ tự bậc → SQS; phân vị ngành chỉ khi ≥ 5 mã cùng ngành; ô trống có lý do nguồn thiếu; bất lợi theo chiều tốt", () => {
    const r = signalRows({ panel, rows, evOf, evoOf, contributions: [{ id: "kq_nowcast", contribution: 0.12 }] });
    expect(r.map((x) => x.spec.id)).toEqual(["stealth20", "camslim_cup", "kq_nowcast", "smart_score"]);
    const kq = r.find((x) => x.spec.id === "kq_nowcast")!;
    expect(kq.text).toBe("+72,8%"); expect(kq.pctSector).not.toBeNull(); expect(kq.contribution).toBe(0.12);
    expect(r.find((x) => x.spec.id === "camslim_cup")!.text).toBe("Phá vỡ pivot");
    expect(r.find((x) => x.spec.id === "stealth20")!.sourceMissing).toBe(true);
    expect(r.find((x) => x.spec.id === "smart_score")!.adverse).toBe(true);
  });

  it("bảng: SQS + xu hướng, IC chế độ hôm nay (< 10 ngày -> chưa đủ), tín hiệu mới ghi 'mới', lọc tab / bất lợi / A–B", () => {
    render(<SignalTableView panel={panel} rows={rows} evOf={evOf} evoOf={evoOf} contributions={[]} regime="DOWNTREND" />);
    expect(screen.getByTestId("elite-sig-sqs-stealth20").textContent).toMatch(/96.*Đã chứng minh/);
    expect(screen.getByTestId("elite-sig-regime-stealth20").textContent).toMatch(/\+0,021.*74n/);
    expect(screen.getByTestId("elite-sig-sqs-kq_nowcast").textContent).toContain("mới");
    expect(screen.getByTestId("elite-sig-stealth20").textContent).toContain("nguồn thiếu");
    fireEvent.click(screen.getByTestId("elite-sig-tab-Cơ bản"));
    expect(screen.getByTestId("elite-signal-table").querySelectorAll("tbody tr").length).toBe(1);
    fireEvent.click(screen.getByTestId("elite-sig-tab-all"));
    fireEvent.click(screen.getByTestId("elite-sig-weighted"));
    expect(screen.queryByTestId("elite-sig-smart_score")).toBeNull();
    fireEvent.click(screen.getByTestId("elite-sig-weighted"));
    fireEvent.click(screen.getByTestId("elite-sig-adverse"));
    expect([...screen.getByTestId("elite-signal-table").querySelectorAll("tbody tr")].map((t) => t.getAttribute("data-testid"))).toEqual(["elite-sig-smart_score"]);
    cleanup();
    render(<SignalTableView panel={panel} rows={rows} evOf={evOf} evoOf={evoOf} contributions={[]} regime="UPTREND" />);
    expect(screen.getByTestId("elite-sig-regime-stealth20").textContent).toContain("chưa đủ");
  });
});
