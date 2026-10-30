import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSieuQuetScanner } from "./useSieuQuetScanner";
import { useScannerBasket } from "./useScannerBasket";
import { useWatchlists } from "./useWatchlists";
import { useGoldenSepa } from "./useGoldenSepa";
import { useTop20Radar } from "./useTop20Radar";
import { useQualityScore } from "./useQualityScore";
import { useWorldSectorScores } from "./useWorldSectorScores";
import { fmtZ } from "../lib/worldSectors/types";
import { buildRadarModel, type RadarModel, type RadarSources } from "../lib/radarModel";
import { useGatewayBuyTimeline } from "./useGatewayBuyTimeline";
import { useDecisionStates } from "./useCotucDecision";
import { buyCriterion } from "../lib/radarTimeline";

/**
 * ELITE COMMAND RADAR theo ★ Danh mục được chọn cho Radar (mặc định "Danh mục của tôi").
 * Gom dữ liệu thật của 6 tab (Siêu Quét qua Gateway; các tab còn lại cùng nguồn API với tab đó, SWR dùng chung
 * bộ đệm) và chấm hội tụ 5 tiêu chí cho từng mã. Gọi ở cả Radar và Action Center: SWR khử trùng nên không gọi API lặp.
 */
export function useRadarModel(): RadarModel & { listName: string; listId: string; tickers: string[]; loading: boolean } {
  const { radar } = useWatchlists();
  const tickers = radar.tickers;
  const { items, isLoading } = useSieuQuetScanner();
  const basket = useScannerBasket(items, "WATCHLIST", tickers);
  const live = useAppStore((s) => s.livePrices);

  const ta = useGoldenSepa();
  const { top20Data } = useTop20Radar(null);
  const { qualityScoreData } = useQualityScore();
  // Tiêu chí 6 "Cổ tức · điểm mua": Timeline điểm mua + DecisionBar (tab Cổ tức) — chỉ xét mã trên Radar.
  const buyTimeline = useGatewayBuyTimeline();
  const decisionStates = useDecisionStates();
  const buy = useMemo(() => {
    if (!buyTimeline.data) return null; // chưa tải / lỗi -> "chưa có dữ liệu", không tính là "không đạt"
    const decisions = decisionStates.states.map((d) => ({ ticker: d.ticker, level: d.decision.level, combinedProbability: d.decision.combinedProbability }));
    return buyCriterion(buyTimeline.data.rows, decisions, tickers);
  }, [buyTimeline.data, decisionStates.states, tickers]);
  const ws = useWorldSectorScores();

  const sources: RadarSources = useMemo(() => {
    // 2026-10-17: mã thuộc ngành ICB THUẬN GIÓ ngắn hạn (ngành thế giới → ngành VN, xếp hạng đã kiểm định đặt trước WS-v1,
    // lợi thế nhỏ) — thành phần thật theo tỷ trọng; thay bảng "hưởng lợi" cũ (mã đặt tay, ±0,5% một ngày).
    let world: Map<string, string> | null = null;
    if (ws.data) {
      world = new Map();
      const rows = new Map(ws.data.rows.map((r) => [r.icb, r]));
      for (const t of ws.data.rankings.short.tailwind) {
        for (const c of rows.get(t.icb)?.constituents ?? []) {
          if (!world.has(c.ticker)) world.set(c.ticker, `Ngành ${t.nameVi} thuận gió ngắn hạn ${fmtZ(t.score, 2)} σ (ngành thế giới → VN)`);
        }
      }
    }
    return {
      scanner: new Map(basket.items.map((i) => [i.ticker, i])),
      world,
      sector: top20Data?.top20
        ? new Map(top20Data.top20.map((r, i) => [r.ticker, `Top 20 Hội tụ dòng tiền: hạng ${i + 1}, điểm ${Math.round(r.confluenceScore)}`]))
        : null,
      // Tiêu chí 4 (SP5): SEPA Sẵn sàng / Cảnh báo mua trên Gateway (Golden SEPA), kèm xác nhận chéo — thay Đồng thuận TA cũ.
      ta: ta.doc
        ? new Map(ta.rows.filter((r) => r.sepa.list !== "THEO DÕI").map((r) => [r.sepa.ticker, `SEPA ${r.sepa.list.toLowerCase()}${r.sepa.metrics.pattern ? ` · ${r.sepa.metrics.pattern} ${r.sepa.metrics.footprint ?? ""}`.trimEnd() : ""} · xác nhận ${r.confirms.length}/3${r.confirms.length ? ` (${r.confirms.map((c) => c.label).join(", ")})` : ""}`]))
        : null,
      dividend: buy ? buy.pass : null,
      dividendFail: buy?.fail,
    };
  }, [basket.items, ws.data, top20Data, ta.rows, ta.doc, buy]);

  const model = useMemo(() => buildRadarModel(tickers, sources, live), [tickers, sources, live]);
  return { ...model, listName: radar.name, listId: radar.id, tickers, loading: isLoading || basket.loading };
}
