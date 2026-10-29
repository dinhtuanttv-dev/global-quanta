import { useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useRadarModel } from '../../hooks/useRadarModel';
import { isMarketGatewayEnabled } from '../../services/marketDataClient';
import SmartNewsBody from '../news/SmartNewsBody';
import Card, { AiChip } from './Card';

// TIN TỨC THÔNG MINH — tin THẬT cho các mã của ★ Danh mục trên Radar (+ mã đang chọn):
// công bố thông tin chính thức, tin doanh nghiệp, Vietstock, CafeF; đã gắn mã, gộp tin trùng giữa nguồn,
// phân loại sự kiện, chấm cảm xúc, đo phản ứng giá so VN-Index và xếp theo mức quan trọng.
// N1 (29/10/2026): thân danh sách dùng chung với Elite 10 (components/news/SmartNewsBody).

export default function NewsFeed() {
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const selectTicker = useAppStore((s) => s.selectTicker);
  const radar = useRadarModel();
  const tickers = useMemo(() => [...new Set([...radar.tickers, ...(selectedTicker ? [selectedTicker] : [])])], [radar.tickers, selectedTicker]);
  const enabled = isMarketGatewayEnabled();

  const coreSet = useMemo(() => new Set(radar.core.map((n) => n.ticker)), [radar.core]);
  const ringSet = useMemo(() => new Set(radar.ring.map((n) => n.ticker)), [radar.ring]);
  const listSet = useMemo(() => new Set(radar.tickers), [radar.tickers]);
  const relevance = useCallback((t: string) => (coreSet.has(t) ? 'Core' : ringSet.has(t) ? 'Ring' : listSet.has(t) ? 'Danh mục' : t === selectedTicker ? 'Đang chọn' : null), [coreSet, ringSet, listSet, selectedTicker]);
  // Ưu tiên Core > Ring > danh mục khi cùng mức quan trọng.
  const rank = useCallback((t: string) => (coreSet.has(t) ? 2 : ringSet.has(t) ? 1 : 0), [coreSet, ringSet]);

  return (
    <Card id="news" title={<>TIN TỨC THÔNG MINH <AiChip /></>} className="news-block">
      {!enabled && <div className="ac-hold text-[10.5px] text-slate-400">Cần Market Gateway để tải tin thật.</div>}
      {enabled && !tickers.length && <div className="ac-hold text-[10.5px] text-slate-400">Thêm mã vào ★ {radar.listName} để nhận tin liên quan.</div>}
      {enabled && tickers.length > 0 && <SmartNewsBody tickers={tickers} selectedTicker={selectedTicker} onTicker={selectTicker} relevance={relevance} rank={rank} />}
    </Card>
  );
}
