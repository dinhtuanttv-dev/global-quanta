import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import real from "../../../../lib/cotuc/__fixtures__/decision-states.real.json";
import { parseDecisionStates, parseSignalTracking, type DecisionSnapshot, type SignalTracking } from "../../../../lib/cotuc/decision";
import { DecisionBar, DecisionBarCard } from "./DecisionBar";
import { SignalTrackingCard, SignalTrackingPanel } from "./SignalTrackingPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ảnh chụp THẬT do bộ dựng của Project A tạo từ giá SSI + sự kiện VNDirect (MWG, REE, FPT — 03/10/2026).
const states = (real as { states: DecisionSnapshot[] }).states;
const byTicker = (t: string) => states.find((s) => s.ticker === t)!;

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return el;
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

describe("hợp đồng dữ liệu", () => {
  it("ảnh chụp thật của server qua được schema zod", () => {
    const r = parseDecisionStates(real);
    expect(r.ok).toBe(true);
  });
  it("schema chặn dữ liệu hỏng (xác suất ngoài [0,1])", () => {
    const bad = { ...real, states: [{ ...states[0], decision: { ...states[0].decision, combinedProbability: 1.4 } }] };
    expect(parseDecisionStates(bad).ok).toBe(false);
  });
});

describe("DecisionBar", () => {
  it("hiển thị đúng trạng thái, xác suất và đủ 8 điều kiện của dữ liệu thật", async () => {
    for (const s of states) {
      const el = await mount(<DecisionBar state={s} />);
      const bar = el.querySelector('[data-testid="decision-bar"]')!;
      expect(bar.getAttribute("data-level")).toBe(s.decision.level);
      expect(el.querySelectorAll('[data-testid="decision-check-row"]').length).toBe(8);
      expect(el.textContent).toContain(`${Math.round(s.decision.combinedProbability * 100)}%`);
      expect(el.textContent).toContain("không phải khuyến nghị đầu tư");
      expect(el.textContent).not.toMatch(/NaN|undefined/);
      document.body.innerHTML = "";
    }
  });

  it("MWG: GDKHQ đã xác nhận nhưng đã qua vùng mua -> Chưa nên", async () => {
    const el = await mount(<DecisionBar state={byTicker("MWG")} />);
    expect(el.querySelector('[data-testid="decision-word"]')!.textContent).toBe("Chưa nên");
    expect(el.textContent).toContain("đã xác nhận");
  });

  it("FAVORABLE hiện kế hoạch chia đợt", async () => {
    const s = byTicker("REE");
    const fav: DecisionSnapshot = {
      ...s,
      recommendation: { ...s.recommendation, action: "IN_WINDOW" },
      decision: { ...s.decision, level: "FAVORABLE", headline: "Thuận lợi để vào — xác suất tổng hợp 66%" },
      entryPlan: { ...s.entryPlan, tranches: [{ offset: -25, fraction: 1 / 3 }, { offset: -20, fraction: 1 / 3 }, { offset: -15, fraction: 1 / 3 }] },
    };
    const el = await mount(<DecisionBar state={fav} />);
    expect(el.querySelector('[data-testid="decision-word"]')!.textContent).toBe("Thuận lợi để vào");
    expect(el.querySelector('[data-testid="decision-plan"]')!.textContent).toContain("Đợt 3: T−15 · 33%");
  });

  it("DecisionBarCard tra mã từ /api/cotuc/decision-states; mã ngoài danh mục báo rõ", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(real), { status: 200 })));
    const el = await mount(<><DecisionBarCard ticker="REE" /><DecisionBarCard ticker="ZZZ" /></>);
    expect(el.querySelector('[data-testid="decision-bar"]')!.getAttribute("data-level")).toBe(byTicker("REE").decision.level);
    expect(el.querySelector('[data-testid="decision-empty"]')!.textContent).toContain("Chưa có trạng thái quyết định cho ZZZ");
  });
});

describe("SignalTrackingPanel", () => {
  const empty: SignalTracking = {
    summary: {
      totalSignals: 0, resolvedSignals: 0, rollingAccuracy: null, rollingWindowSize: 20, brierScore: null,
      cusum: { posSum: 0, negSum: 0, n: 0, alarmed: false, alarmDirection: null }, meanPredicted: null,
      byLevel: [{ level: "FAVORABLE", total: 0, resolved: 0, hitRate: null }, { level: "WATCH", total: 0, resolved: 0, hitRate: null }],
    },
    recent: [],
  };

  it("chưa có kết quả -> giải thích rõ, không hiện số giả", async () => {
    expect(parseSignalTracking(empty).ok).toBe(true);
    const el = await mount(<SignalTrackingPanel data={empty} />);
    expect(el.querySelector('[data-testid="tracking-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="tracking-accuracy"]')!.textContent).toBe("—");
    expect(el.querySelector('[data-testid="cusum-alarm"]')).toBeNull();
  });

  it("có kết quả + CUSUM báo động", async () => {
    const data: SignalTracking = {
      summary: { ...empty.summary, totalSignals: 2, resolvedSignals: 1, rollingAccuracy: 0, brierScore: 0.49, meanPredicted: 0.7,
        cusum: { posSum: 0, negSum: -5.2, n: 12, alarmed: true, alarmDirection: "LOW" } },
      recent: [
        { id: "REE:w3:2026-10-20", ticker: "REE", windowId: "w3", level: "WATCH", predictedProbability: 0.65, exDate: "2026-11-26", exDateStatus: "ESTIMATED",
          entryDate: "2026-10-20", plannedExitDate: "2026-12-01", issuedAt: "2026-10-20T23:00:00Z", outcome: null, realizedCar: null, exitDate: null, outcomeRecordedAt: null },
        { id: "MWG:w2:2026-08-01", ticker: "MWG", windowId: "w2", level: "FAVORABLE", predictedProbability: 0.7, exDate: "2026-10-07", exDateStatus: "CONFIRMED",
          entryDate: "2026-08-01", plannedExitDate: "2026-10-14", issuedAt: "2026-08-01T23:00:00Z", outcome: 0, realizedCar: -0.021, exitDate: "2026-10-14", outcomeRecordedAt: "2026-10-15T23:00:00Z" },
      ],
    };
    expect(parseSignalTracking(data).ok).toBe(true);
    const el = await mount(<SignalTrackingPanel data={data} />);
    expect(el.querySelector('[data-testid="cusum-alarm"]')!.textContent).toContain("THẤP hơn");
    expect(el.querySelectorAll('[data-testid="tracking-row"]').length).toBe(2);
    expect(el.textContent).toContain("−2.1%");
    expect(el.textContent).toContain("đang chờ");
  });

  it("SignalTrackingCard tải từ /api/cotuc/signal-tracking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(empty), { status: 200 })));
    const el = await mount(<SignalTrackingCard />);
    expect(el.querySelector('[data-testid="tracking-total"]')!.textContent).toBe("0");
  });
});
