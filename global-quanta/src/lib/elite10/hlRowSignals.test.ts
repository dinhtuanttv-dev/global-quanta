// Tài liệu 20: ngưỡng tin dùng chung Radar ↔ bảng HL (giá trị cũ của Radar) và tín hiệu từng dòng của bảng Danh mục Elite HL.
import { describe, expect, it } from "vitest";
import { newsInfoByTicker, rimTone, NEWS_HOT_IMPORTANCE, NEWS_HOT_WINDOW_H, NEWS_SENT_THRESHOLD, NEWS_SENT_WINDOW_H } from "../newsSignals";
import { esaOf, hlRowSignals } from "./hlRowSignals";
import type { SmartNewsItem } from "../../hooks/useSmartNews";

const NOW = Date.parse("2026-11-18T08:00:00Z");
const h = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const n = (o: Partial<SmartNewsItem>): SmartNewsItem => ({ id: Math.random().toString(36), title: "t", summary: "", url: null, attachment: null, publishedAt: h(1), source: "CAFEF", sourceLabel: "CafeF",
  alsoIn: [], corroboration: 1, tickers: ["AAA"], eventType: "OTHER", eventLabel: "Khác", sentiment: 0, sentimentHits: [], reaction: null, insight: null, importance: 50, ...o });

/** Bản sao nguyên văn phép tính cũ trong EliteCommandRadar (trước 20/11/2026) — để đối chiếu. */
function legacy(items: SmartNewsItem[], now: number) {
  const out = new Map<string, { sentiment: number; hot: boolean }>();
  for (const it of items) {
    const age = it.publishedAt ? (now - Date.parse(it.publishedAt)) / 3_600_000 : 999;
    if (age > 72) continue;
    for (const t of it.tickers) { const cur = out.get(t) ?? { sentiment: 0, hot: false }; cur.sentiment += it.sentiment; if (age <= 24 && it.importance >= 70) cur.hot = true; out.set(t, cur); }
  }
  return out;
}

describe("newsSignals (dùng chung Radar ↔ bảng HL)", () => {
  it("ngưỡng giữ nguyên giá trị cũ của Radar", () => {
    expect([NEWS_SENT_WINDOW_H, NEWS_HOT_WINDOW_H, NEWS_HOT_IMPORTANCE, NEWS_SENT_THRESHOLD]).toEqual([72, 24, 70, 0.25]);
  });
  it("kết quả giống hệt phép tính cũ trên dữ liệu nhiều trường hợp biên", () => {
    const items = [n({ sentiment: 0.3, importance: 70, publishedAt: h(24) }), n({ sentiment: -0.1, publishedAt: h(72) }), n({ sentiment: 0.9, publishedAt: h(72.01) }),
      n({ tickers: ["AAA", "BBB"], sentiment: -0.4, importance: 90, publishedAt: h(24.01) }), n({ tickers: ["CCC"], publishedAt: null }), n({ tickers: ["BBB"], importance: 69, publishedAt: h(1) })];
    expect([...newsInfoByTicker(items, NOW)]).toEqual([...legacy(items, NOW)]);
  });
  it("viền: ≥ +0,25 xanh, ≤ −0,25 đỏ, giữa / không tin -> không viền", () => {
    expect([rimTone({ sentiment: 0.25, hot: false }), rimTone({ sentiment: -0.25, hot: false }), rimTone({ sentiment: 0.24, hot: true }), rimTone(null)]).toEqual(["up", "down", null, null]);
  });
});

describe("hlRowSignals", () => {
  const SIG = { asOf: null, freshFrom: null, regime: null, stealthThreshold: 1.5, adaptiveModels: [], disclaimer: "",
    evidence: { STEALTH_20: { verdict: "edge" }, IFE_INTENT: { verdict: "none" } },
    items: { AAA: { asOf: "", stealth20: { z: -2, on: true, direction: -1, score: null, date: "2026-11-18" }, intent: { state: "x", label: "Xả", p: 0.7, direction: -1, date: "" }, netIntent: null, adaptive: [] }, BBB: null } } as never;
  it("tin 14 ngày (mới trước), tin nổi bật = quan trọng nhất; tin tương lai / quá 14 ngày bị loại; Stealth, ý đồ, giá trong phiên", () => {
    const items = [n({ id: "a", importance: 60, publishedAt: h(5) }), n({ id: "b", importance: 85, publishedAt: h(100), reaction: { sessions: 1, ret: 0, excess: 0, volumeRatio: 1, abnormal: { method: "x", sessions: 1, classification: "absorption" } } }),
      n({ id: "c", importance: 99, publishedAt: h(24 * 15) }), n({ id: "d", importance: 99, publishedAt: new Date(NOW + 3_600_000).toISOString() })];
    const m = hlRowSignals(["aaa", "BBB"], { news: items, sig: SIG, timelineRows: [], live: { AAA: { price: 10500, changePct: -1.2 }, BBB: { price: 0, changePct: null } }, now: NOW });
    const a = m.get("AAA")!;
    expect(a.items.map((x) => x.id)).toEqual(["a", "b"]); expect(a.top!.id).toBe("b"); expect(esaOf(a.top)!.text).toBe("Hấp thụ");
    expect(a.stealth).toEqual({ dir: -1, z: -2, edge: true, date: "2026-11-18" }); expect(a.intent).toEqual({ label: "Xả", p: 0.7, direction: -1 });
    expect(a.live).toEqual({ price: 10500, changePct: -1.2 });
    const b = m.get("BBB")!;
    expect([b.items.length, b.top, b.stealth, b.intent, b.live, b.rim, b.buy]).toEqual([0, null, null, null, null, null, null]);
  });
  it("nguồn rỗng -> mọi lớp null, không lỗi", () => {
    const m = hlRowSignals(["AAA"], { news: undefined, sig: null, timelineRows: null, live: undefined, now: NOW });
    expect(m.get("AAA")).toMatchObject({ news: null, rim: null, top: null, items: [], stealth: null, buy: null, live: null });
  });
});
