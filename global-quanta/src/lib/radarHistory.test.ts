import { afterEach, describe, expect, it } from "vitest";
import { previousSnapshot, radarEvents, scoreTrails, snapFingerprint, type SnapItem } from "./radarHistory";
import { alertActions, checkAlerts, readAlerts, resetPriceAlertsForTest } from "./priceAlerts";

const it_ = (t: string, s: number, st: SnapItem["st"] = "stable", extra: Partial<SnapItem> = {}): SnapItem =>
  ({ t, s, g: "Tài chính", sm: 60, st, core: s >= 4, pass: null, p: 10_000, c: 0, ...extra });

describe("Lịch sử Radar", () => {
  it("sự kiện: vào/ra Core, ±2 tiêu chí, đổi trạng thái; bỏ qua mã mới thêm/bị bỏ", () => {
    const prev = [it_("AAA", 3), it_("BBB", 5), it_("CCC", 1), it_("DDD", 3, "stable"), it_("EEE", 2), it_("OLD", 5)];
    const cur = [it_("AAA", 4), it_("BBB", 3), it_("CCC", 3), it_("DDD", 3, "caution"), it_("EEE", 3, "breakout"), it_("NEW", 6)];
    const ev = radarEvents(prev, cur);
    expect(ev.map((e) => `${e.kind}:${e.ticker}`)).toEqual([
      "enter_core:AAA", "leave_core:BBB", "turn_caution:DDD", "turn_breakout:EEE", "score_up:CCC",
    ]);
    expect(ev[0].text).toBe("AAA vào Core (3/6 → 4/6)");
    expect(radarEvents(null, cur)).toEqual([]);
  });

  it("ảnh chụp trước, vệt 5 ngày (cũ → mới), dấu vân tay bỏ qua giá", () => {
    const hist = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]
      .map((date, i) => ({ date, items: [it_("AAA", i % 7)] }));
    expect(previousSnapshot(hist, "2026-10-02")?.date).toBe("2026-10-01");
    expect(previousSnapshot(hist, "2026-09-24")).toBeNull();
    expect(scoreTrails(hist, "2026-10-02").get("AAA")).toEqual([1, 2, 3, 4, 5]);
    expect(snapFingerprint([it_("A", 1, "stable", { p: 1 })])).toBe(snapFingerprint([it_("A", 1, "stable", { p: 2, c: 3 })]));
    expect(snapFingerprint([it_("A", 1)])).not.toBe(snapFingerprint([it_("A", 2)]));
  });
});

describe("Cảnh báo giá", () => {
  afterEach(() => { window.localStorage.clear(); resetPriceAlertsForTest(); });

  it("chạm ≥ / ≤ thì kích hoạt một lần; không đặt trùng", () => {
    const up = alertActions.add("fpt", "above", 100_000, "Đỉnh 20 phiên")!;
    alertActions.add("FPT", "below", 90_000);
    expect(alertActions.add("FPT", "above", 100_000)).toBeNull();
    expect(readAlerts()).toHaveLength(2);
    expect(checkAlerts(readAlerts(), { FPT: { price: 95_000 } })).toEqual([]);
    const hits = checkAlerts(readAlerts(), { FPT: { price: 100_100 } });
    expect(hits.map((h) => h.alert.id)).toEqual([up.id]);
    alertActions.markTriggered(hits.map((h) => ({ id: h.alert.id, price: h.price })));
    expect(checkAlerts(readAlerts(), { FPT: { price: 101_000 } })).toEqual([]);
    expect(readAlerts().find((a) => a.id === up.id)?.triggeredPrice).toBe(100_100);
    expect(checkAlerts(readAlerts(), { FPT: { price: 89_000 } })).toHaveLength(1);
  });
});
