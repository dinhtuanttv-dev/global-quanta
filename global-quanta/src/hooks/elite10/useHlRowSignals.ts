// HL-RADAR (20/11/2026, tài liệu 20) — gom nguồn cho các lớp hiển thị của bảng Danh mục Elite HL:
// 1 lệnh tin thông minh + 1 lệnh tín hiệu dòng tiền cho CẢ danh mục; Timeline và giá trực tiếp đã có sẵn trong cache / luồng giá.
// Lớp nào tắt thì không gọi nguồn của lớp đó.
import { useCallback, useMemo, useState } from "react";
import { useSmartNews } from "../useSmartNews";
import { useRadarSignals } from "../useRadarSignals";
import { useEliteTiming } from "./useEliteTiming";
import { useAppStore } from "../../store/useAppStore";
import { hlRowSignals, NEWS_STRIP_DAYS } from "../../lib/elite10/hlRowSignals";

export type HlLayer = "news" | "signals" | "buy" | "live" | "impact" | "trend" | "cockpit";
export type HlLayers = Record<HlLayer, boolean>;
export const HL_LAYERS_KEY = "gq.hl.layers.v1";
export const HL_LAYER_DEFAULT: HlLayers = { news: true, signals: true, buy: true, live: true, impact: true, trend: true, cockpit: true };
export const HL_LAYER_VI: Record<HlLayer, string> = { news: "Tin & cảm xúc", signals: "Dòng tiền ◆", buy: "Điểm mua ⏱", live: "Giá trong phiên", impact: "Tác động", trend: "Xu hướng & tua lại", cockpit: "Buồng lái" };

const readLayers = (): HlLayers => {
  try { const raw = window.localStorage.getItem(HL_LAYERS_KEY); return raw ? { ...HL_LAYER_DEFAULT, ...(JSON.parse(raw) as Partial<HlLayers>) } : HL_LAYER_DEFAULT; } catch { return HL_LAYER_DEFAULT; }
};

/** Công tắc lớp (mặc định bật hết — mọi tính năng hiện mặc định), nhớ theo trình duyệt. */
export function useHlLayers(): [HlLayers, (k: HlLayer) => void] {
  const [layers, setLayers] = useState<HlLayers>(readLayers);
  const toggle = useCallback((k: HlLayer) => setLayers((cur) => {
    const next = { ...cur, [k]: !cur[k] };
    try { window.localStorage.setItem(HL_LAYERS_KEY, JSON.stringify(next)); } catch { /* chỉ nhớ trong phiên */ }
    return next;
  }), []);
  return [layers, toggle];
}

export function useHlRowSignals(tickers: readonly string[], layers: HlLayers) {
  const list = useMemo(() => [...tickers], [tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const news = useSmartNews(layers.news ? list : [], NEWS_STRIP_DAYS);
  const sig = useRadarSignals(layers.signals ? list : []);
  const timing = useEliteTiming();
  const live = useAppStore((s) => s.livePrices);
  const now = Math.floor(Date.now() / 60_000) * 60_000; // làm tròn phút: không tính lại mỗi lần vẽ
  const map = useMemo(() => hlRowSignals(list, {
    news: layers.news ? news.data?.items : null, sig: layers.signals ? sig.data : null,
    timelineRows: layers.buy ? timing.data?.rows : null, live: layers.live ? live : null, now,
  }), [list, layers, news.data, sig.data, timing.data, live, now]);
  return { map, now, newsError: news.error ? String((news.error as Error).message ?? news.error) : null, newsLoading: news.isLoading, sigError: sig.error, edgeVerdict: sig.data?.evidence?.STEALTH_20?.verdict ?? null };
}
