// HL-RADAR P1/P2 (20/11/2026, tài liệu 20) — tín hiệu HIỂN THỊ cho từng dòng của bảng Danh mục Elite HL, lấy từ đúng các nguồn mà
// ELITE COMMAND RADAR đang dùng (tin thông minh, lớp dòng tiền, Timeline điểm mua, giá trực tiếp). Hàm thuần, không I/O.
// KHÔNG đọc vào hạng, tỷ trọng, ngưỡng ra, PZ-v2 hay hàng chờ — chỉ để vẽ lớp mô tả.
import type { SmartNewsItem } from "../../hooks/useSmartNews";
import type { RadarSignals } from "../../services/marketDataClient";
import type { TimelineRow } from "../cotuc/buy-timeline";
import { pickRadarBuyRows, type RadarBuyInfo } from "../radarTimeline";
import { newsInfoByTicker, rimTone, type NewsInfo } from "../newsSignals";

export const NEWS_STRIP_DAYS = 14;

export interface HlRowSignal {
  ticker: string;
  news: NewsInfo | null; rim: "up" | "down" | null;
  /** Tin nổi bật trong 14 ngày: quan trọng nhất, hoà thì mới nhất. */
  top: SmartNewsItem | null;
  /** Mọi tin của mã trong 14 ngày (mới trước) — cho dải "Tin & tác động". */
  items: SmartNewsItem[];
  stealth: { dir: 1 | -1; z: number | null; edge: boolean; date: string | null } | null;
  intent: { label: string; p: number | null; direction: number } | null;
  buy: RadarBuyInfo | null;
  live: { price: number; changePct: number | null } | null;
}

export interface HlRowInputs {
  news: readonly SmartNewsItem[] | null | undefined;
  sig: RadarSignals | null | undefined;
  timelineRows: readonly TimelineRow[] | null | undefined;
  live: Record<string, { price: number; changePct: number | null }> | null | undefined;
  now: number;
}

export function hlRowSignals(tickers: readonly string[], inp: HlRowInputs): Map<string, HlRowSignal> {
  const news = inp.news ?? [];
  const info = newsInfoByTicker(news, inp.now);
  const buys = pickRadarBuyRows(inp.timelineRows ?? [], tickers);
  const edge = inp.sig?.evidence?.STEALTH_20?.verdict === "edge";
  const from = inp.now - NEWS_STRIP_DAYS * 86_400_000;
  const out = new Map<string, HlRowSignal>();
  for (const raw of tickers) {
    const t = raw.toUpperCase();
    const items = news.filter((n) => n.tickers.includes(t) && n.publishedAt && Date.parse(n.publishedAt) >= from && Date.parse(n.publishedAt) <= inp.now)
      .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
    const top = items.reduce<SmartNewsItem | null>((m, n) => (!m || n.importance > m.importance ? n : m), null);
    const s = inp.sig?.items?.[t] ?? null;
    const live = inp.live?.[t];
    const ni = info.get(t) ?? null;
    out.set(t, {
      ticker: t, news: ni, rim: rimTone(ni), top, items,
      stealth: s?.stealth20?.on && s.stealth20.direction ? { dir: s.stealth20.direction > 0 ? 1 : -1, z: s.stealth20.z, edge, date: s.stealth20.date } : null,
      intent: s?.intent ? { label: s.intent.label, p: s.intent.p, direction: s.intent.direction } : null,
      buy: buys.get(t) ?? null,
      live: live && Number.isFinite(live.price) && live.price > 0 ? { price: live.price, changePct: live.changePct } : null,
    });
  }
  return out;
}

/** Nhãn phản ứng giá ESA của một tin (Campbell–Wasley, Gateway) — MÔ TẢ. */
export const ESA_VI: Record<string, { text: string; tone: "up" | "warn" | "muted" }> = {
  repricing: { text: "Định giá lại", tone: "up" },
  absorption: { text: "Hấp thụ", tone: "warn" },
  price_only: { text: "Chỉ giá", tone: "warn" },
  ignored: { text: "Thị trường bỏ qua", tone: "muted" },
  pending: { text: "Đang chờ đo", tone: "muted" },
  insufficient: { text: "Chưa đủ dữ liệu", tone: "muted" },
};
export const esaOf = (n: SmartNewsItem | null | undefined) => (n?.reaction?.abnormal?.classification ? ESA_VI[n.reaction.abnormal.classification] ?? null : null);
