// N1 (29/10/2026) — "📰 Tin tức thông minh Elite 10" trong Hồ sơ 360°: CÙNG mã nguồn với cột phải (SmartNewsBody), danh sách mã =
// 10 mã danh mục Elite (Bảng quyết định) + mã đang xem. Bấm mã trên tin -> mở Hồ sơ 360° của mã đó.
import { useCallback, useMemo } from "react";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";
import SmartNewsBody from "../../news/SmartNewsBody";

export default function EliteNewsPanel({ ticker, onTicker }: { ticker: string; onTicker: (t: string) => void }) {
  const { data } = useEliteDecision();
  const elite = useMemo(() => (data?.portfolio ?? []).map((p) => p.ticker), [data]);
  // chỉ mã cổ phiếu 3 ký tự (VNINDEX… không có tin theo mã và làm API từ chối cả danh sách)
  const tickers = useMemo(() => [...new Set([ticker, ...elite])].filter((t) => /^[A-Z][A-Z0-9]{2}$/.test(t)), [ticker, elite]);
  const eliteSet = useMemo(() => new Set(elite), [elite]);
  const relevance = useCallback((t: string) => (t === ticker ? "Đang xem" : eliteSet.has(t) ? "Elite 10" : null), [ticker, eliteSet]);
  const rank = useCallback((t: string) => (t === ticker ? 2 : eliteSet.has(t) ? 1 : 0), [ticker, eliteSet]);
  return (
    <section className="rounded-lg border border-cyan-400/20 bg-slate-950/70 p-3 text-slate-200" data-testid="elite-news-panel">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-bold tracking-wide text-cyan-300">📰 TIN TỨC THÔNG MINH · ELITE 10</h3>
        <span className="text-[10px] text-slate-500">{ticker}{elite.length ? ` + ${elite.filter((t) => t !== ticker).length} mã danh mục Elite` : ""} · ◉ ESA KL = khối lượng bất thường sau tin (đã trừ yếu tố thị trường)</span>
      </div>
      {isMarketGatewayEnabled()
        ? <SmartNewsBody tickers={tickers} selectedTicker={ticker} onTicker={onTicker} relevance={relevance} rank={rank} />
        : <p className="text-[10.5px] text-slate-400">Cần Market Gateway để tải tin thật.</p>}
    </section>
  );
}
