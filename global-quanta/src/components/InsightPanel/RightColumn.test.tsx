import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionCenter from "./ActionCenter";
import EliteCommandRadar from "./EliteCommandRadar";
import { keyLevels, positionSize, tickSize } from "../../lib/tradeLevels";
import { resetWatchlistsForTest } from "../../hooks/useWatchlists";
import { useAppStore } from "../../store/useAppStore";
import { readAlerts, resetPriceAlertsForTest } from "../../lib/priceAlerts";

vi.mock("../../services/api", async (orig) => ({ ...(await orig<typeof import("../../services/api")>()), getAccessToken: async () => "tok" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bars = Array.from({ length: 60 }, (_, i) => {
  const close = 20_000 + i * 100;
  return { date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, open: close, high: close + 200, low: close - 200, close, volume: 1e6 };
});
const scan = {
  generatedAt: "", dataAsOf: "2026-10-02", indexState: null, totalCount: 2,
  items: [
    { ticker: "AAA", companyName: "Cty AAA", sector: null, industry: "Ngân hàng", sectorGroup: "Tài chính", price: 25_900, changePct: 1.2, faScore: 60, taScore: 70,
      eventImpactScore: 0, smartScore: 72, rsRating: 85, riskAdjustedMomentum: 1, riskRewardRatio: 1.8, trendTag: "Up-Trend", qualityTag: null,
      confluenceStatusCode: null, confluenceStatusLabel: null, confluenceBoost: 0, confluenceReasonCodes: [], breakoutBoostBadge: true, piotroskiFScore: 6, fScoreMax: 9,
      foreignNetBuyFlag: false, computedAt: "" },
    { ticker: "BBB", companyName: "Cty BBB", sector: null, industry: "Thép & Kim loại", sectorGroup: "Xây dựng & Vật liệu", price: 15_000, changePct: -0.5, faScore: 40, taScore: 30,
      eventImpactScore: 0, smartScore: 45, rsRating: 30, riskAdjustedMomentum: 0, riskRewardRatio: 0.9, trendTag: "Down-Trend", qualityTag: null,
      confluenceStatusCode: null, confluenceStatusLabel: null, confluenceBoost: 0, confluenceReasonCodes: [], breakoutBoostBadge: false, piotroskiFScore: 5, fScoreMax: 9,
      foreignNetBuyFlag: false, computedAt: "" },
  ],
};

const snap = (t: string, s: number, pass: string) => ({ t, s, g: "Tài chính", sm: 70, st: "stable", core: s >= 4, pass, p: 25_000, c: 0 });
const history = {
  list: "Danh mục của tôi", today: "2026-10-02",
  snapshots: [
    { date: "2026-09-30", items: [snap("AAA", 2, "110000")] },
    { date: "2026-10-01", items: [snap("AAA", 4, "111100")] },
  ],
};
const calls: { url: string; init?: RequestInit }[] = [];
const ev = (verdict: string) => ({ signal: "STEALTH_20", label: "Stealth", verdict, all: { horizon: 3, n: 1704, hitRate: 0.5434, baseline: 0.4806, zClustered: 2.64, verdict }, regime: null });
const signals = {
  asOf: "2026-10-02", freshFrom: "2026-09-30", regime: "SIDEWAY", stealthThreshold: 1.5,
  evidence: { STEALTH_20: ev("edge"), IFE_INTENT: { ...ev("none"), signal: "IFE_INTENT" } },
  adaptiveModels: [3, 5, 10].map((horizon) => ({ horizon, active: false, version: null })),
  items: {
    AAA: { asOf: "2026-10-02", stealth20: { z: 2.4, on: true, direction: 1, score: 2.4, date: "2026-10-02" }, intent: { state: "ACC_ACTIVE", label: "Gom chủ động", p: 0.86, direction: 1, date: "2026-10-02" }, netIntent: 0.5, adaptive: [] },
    BBB: null,
  },
  disclaimer: "",
};

const roots: ReturnType<typeof createRoot>[] = [];
async function mount(node: React.ReactNode, tickers: string[]) {
  vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
  vi.stubEnv("VITE_SCANNER_SOURCE", "gateway");
  window.localStorage.setItem("gq.watchlists.v1", JSON.stringify({ activeId: "default", lists: [{ id: "default", name: "Danh mục của tôi", tickers }] }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/api/market/radar/history")) return { ok: true, status: 200, json: async () => history };
    if (u.includes("/api/market/radar/signals")) return { ok: true, status: 200, json: async () => signals };
    if (u.includes("/api/market/scanner") && !u.includes("custom")) return { ok: true, status: 200, json: async () => scan };
    if (u.includes("/api/market/ohlcv")) return { ok: true, status: 200, json: async () => ({ bars }) };
    return { ok: false, status: 404, json: async () => ({ error: "không có" }) };
  }));
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{node}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return el;
}

describe("Cột phải: Radar + Action Center thế hệ mới", () => {
  afterEach(() => {
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetWatchlistsForTest(); resetPriceAlertsForTest(); document.body.innerHTML = "";
    calls.length = 0;
    useAppStore.setState({ selectedTicker: null, toast: null });
  });

  it("mức giá then chốt và máy tính khối lượng theo % rủi ro (lô 100, không vượt vốn)", () => {
    const lv = keyLevels(bars, null)!;
    expect(lv.ma20).toBeCloseTo(24_950, 0);
    expect(lv.atr14).toBeCloseTo(400, 0);
    expect(lv.high20).toBe(26_100);
    expect(lv.low20).toBe(23_800);
    expect(lv.stop).toBeCloseTo(25_100, 0); // giá 25.900 − 2×400
    const p = positionSize(100_000_000, 1, 25_900, 25_100)!;
    expect(p.shares).toBe(1_200); // 1.000.000 / 800 = 1.250 -> lô 100
    expect(p.riskVnd).toBe(960_000);
    expect(positionSize(10_000_000, 50, 25_900, 25_800)!.shares).toBe(300); // giới hạn bởi vốn
    expect(positionSize(1e8, 1, 25_900, 26_000)).toBeNull();
    expect([tickSize(9_000), tickSize(25_000), tickSize(60_000)]).toEqual([10, 50, 100]);
  });

  it("Action Center: Quan tâm thêm mã vào danh mục Radar; Loại bỏ có hoàn tác; không còn nút MUA/BÁN", async () => {
    useAppStore.setState({ selectedTicker: "BBB" });
    const el = await mount(<ActionCenter />, ["AAA"]);
    expect(el.textContent).not.toMatch(/MUA|BÁN/);
    const btn = (re: RegExp) => [...el.querySelectorAll("button")].find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement;
    expect(btn(/Loại bỏ/).disabled).toBe(true);
    await act(async () => { btn(/Quan tâm/).click(); });
    expect(JSON.parse(window.localStorage.getItem("gq.watchlists.v1")!).lists[0].tickers).toEqual(["AAA", "BBB"]);
    expect(btn(/Đang quan tâm/).disabled).toBe(true);
    await act(async () => { btn(/Loại bỏ/).click(); });
    expect(JSON.parse(window.localStorage.getItem("gq.watchlists.v1")!).lists[0].tickers).toEqual(["AAA"]);
    const toast = useAppStore.getState().toast!;
    expect(toast.message).toContain("Đã loại BBB");
    await act(async () => { toast.onUndo!(); });
    expect(JSON.parse(window.localStorage.getItem("gq.watchlists.v1")!).lists[0].tickers).toEqual(["AAA", "BBB"]);
    expect(el.textContent).toContain("MÁY TÍNH KHỐI LƯỢNG");
    expect(el.textContent).toContain("Dừng lỗ gợi ý");
  });

  it("Radar: mỗi mã là nút bấm truy cập được bằng bàn phím, nhóm ngành có nhãn; chọn mã hiện giải trình 3 trạng thái", async () => {
    const el = await mount(<EliteCommandRadar />, ["AAA", "BBB"]);
    const nodes = [...el.querySelectorAll('svg [role="button"]')];
    expect(nodes.map((n) => n.getAttribute("aria-label")?.split(":")[0]).sort()).toEqual(["AAA", "BBB"]);
    expect(nodes.every((n) => n.getAttribute("tabindex") === "0")).toBe(true);
    expect(el.textContent).toContain("Tài chính · 1");
    expect(el.textContent).toContain("XD & VL · 1");
    const aaa = nodes.find((n) => n.getAttribute("aria-label")!.startsWith("AAA")) as SVGGElement;
    await act(async () => { aaa.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(useAppStore.getState().selectedTicker).toBe("AAA");
    expect(el.textContent).toContain("GIẢI TRÌNH HỘI TỤ");
    expect(el.textContent).toContain("Smart 72.0 ≥ 60");
    expect(el.textContent).toContain("Nguồn chưa tải được"); // các nguồn Project A lỗi -> "chưa có dữ liệu", không phải "không đạt"
    await act(async () => { aaa.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(el.querySelector('[role="tooltip"]')?.textContent).toContain("Ngân hàng");
  });

  it("Radar lịch sử: tải theo tài khoản (Bearer), tua lại ngày cũ hiện sự kiện + hội tụ ngày đó; thiếu nguồn thì KHÔNG lưu ảnh chụp", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const el = await mount(<EliteCommandRadar />, ["AAA", "BBB"]);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const get = calls.find((c) => c.url.includes("/api/market/radar/history"))!;
      expect(get.url).toContain("list=Danh+m%E1%BB%A5c+c%E1%BB%A7a+t%C3%B4i");
      expect((get.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      expect(el.textContent).toContain("Chờ đủ 6 nguồn dữ liệu");

      const range = el.querySelector('input[type="range"]') as HTMLInputElement;
      expect(range.max).toBe("2");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, "1");
        range.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(el.textContent).toContain("Đang xem 01/10");
      expect(el.textContent).toContain("AAA vào Core (2/6 → 4/6)");
      expect(el.querySelectorAll('svg [role="button"]')).toHaveLength(1); // ảnh chụp ngày đó chỉ có AAA
      useAppStore.setState({ selectedTicker: "AAA" });
      await act(async () => {});
      expect(el.textContent).toContain("HỘI TỤ NGÀY 01/10");

      await act(async () => { vi.advanceTimersByTime(20_000); });
      expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Cảnh báo giá: đặt nhanh theo mức then chốt, xoá được", async () => {
    useAppStore.setState({ selectedTicker: "AAA" });
    const el = await mount(<ActionCenter />, ["AAA"]);
    expect(el.textContent).toContain("CẢNH BÁO GIÁ");
    const quick = [...el.querySelectorAll("button")].find((b) => /Dừng lỗ gợi ý/.test(b.textContent ?? "")) as HTMLButtonElement;
    await act(async () => { quick.click(); });
    const a = readAlerts();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ ticker: "AAA", kind: "below", price: 25_100, label: "Dừng lỗ gợi ý" });
    expect(el.textContent).toContain("AAA ≤ 25.100");
    const del = el.querySelector('button[aria-label^="Xoá cảnh báo"]') as HTMLButtonElement;
    await act(async () => { del.click(); });
    expect(readAlerts()).toHaveLength(0);
  });

  it("Lớp tín hiệu: ◆ Stealth 20 trên chấm + bằng chứng kiểm định; IFE chỉ tham khảo; mô hình chưa đạt -> không có xác suất", async () => {
    const el = await mount(<EliteCommandRadar />, ["AAA", "BBB"]);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls.some((c) => c.url.includes("/api/market/radar/signals") && c.url.includes("tickers=AAA%2CBBB"))).toBe(true);
    const box = el.querySelector('[aria-label="Tín hiệu dòng tiền"]')!;
    expect(box.textContent).toContain("ĐÃ KIỂM ĐỊNH");
    expect(box.textContent).toContain("đúng chiều 54% so với nền 48% sau T+3");
    expect(box.textContent).toContain("◆ AAA ▲ +2,40");
    expect(box.textContent).toContain("1 mã chưa có dữ liệu dòng tiền");
    expect(box.textContent).toContain("chưa đạt kiểm định ngoài mẫu");
    expect(el.querySelectorAll("svg rect.radar-stealth")).toHaveLength(1);
    const aaa = el.querySelector('svg [role="button"][aria-label^="AAA"]')!;
    expect(aaa.getAttribute("aria-label")).toContain("Stealth 20 tích luỹ âm thầm");
    await act(async () => { (box.querySelector("button") as HTMLButtonElement).click(); });
    expect(useAppStore.getState().selectedTicker).toBe("AAA");
    expect(el.textContent).toContain("LỚP TÍN HIỆU DÒNG TIỀN (AI)");
    expect(el.textContent).toContain("Gom chủ động 86%");
  });
});
