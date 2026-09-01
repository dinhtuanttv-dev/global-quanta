/**
 * StockDetailModal.tsx - Modal chi tiet Task 0-4
 */
import { memo, useEffect, useRef } from 'react';
import { type LivePrice } from './livePriceApi';
import { type ConfluenceData } from './ConfluenceScore';
import { type PatternData } from './PatternBadge';
import { type RSRatingData } from './RSRating';

export interface StockDetailData {
  ticker: string;
  sector: string;
  livePrice?: LivePrice | null;
  confluence?: ConfluenceData;
  rsRating?: RSRatingData;
  pattern?: PatternData | null;
  goldenFilter?: boolean;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  positionSize?: number;
  riskReward?: number;
}

interface Props { stock: StockDetailData; isOpen: boolean; onClose: () => void; }

function StockDetailModal({ stock, isOpen, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey); }
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) { document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick); }
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const { livePrice, confluence, rsRating, pattern, goldenFilter } = stock;

  return (
    <div className="modal-overlay">
      <div className="stock-detail-modal" ref={modalRef}>
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-ticker">{stock.ticker}</h2>
            <span className="modal-sector">{stock.sector}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-content">
          <section className="detail-section">
            <h3 className="section-title">T0: Real-Time Price</h3>
            {livePrice ? (
              <div className="price-display">
                <span className="current-price">{livePrice.price?.toLocaleString('vi-VN')} VND</span>
                <span className={`price-change ${(livePrice.changePct ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {(livePrice.changePct ?? 0) >= 0 ? '+' : ''}{(livePrice.changePct ?? 0).toFixed(2)}%
                </span>
              </div>
            ) : <div>Loading...</div>}
          </section>
          {confluence && (
            <section className="detail-section">
              <h3 className="section-title">T2: Confluence Score ({confluence.totalScore})</h3>
              <div className="conf-layers">
                <div className="layer"><span>Macro</span><span>{confluence.macroScore}/25</span></div>
                <div className="layer"><span>Flow</span><span>{confluence.flowScore}/25</span></div>
                <div className="layer"><span>Technical</span><span>{confluence.technicalScore}/25</span></div>
                <div className="layer"><span>Sentiment</span><span>{confluence.sentimentScore}/25</span></div>
              </div>
            </section>
          )}
          <section className="detail-section">
            <h3 className="section-title">T3: Golden Filter</h3>
            <div className="golden-info">
              {rsRating && <span>RS: <strong>{rsRating.rsRating}</strong> {rsRating.isElite ? '⭐' : ''}</span>}
              {pattern && <span>Pattern: <strong>{pattern.label}</strong></span>}
              <span className={`golden-badge ${goldenFilter ? 'passed' : ''}`}>{goldenFilter ? '✅ GOLDEN' : '❌'}</span>
            </div>
          </section>
          {stock.entryPrice && (
            <section className="detail-section">
              <h3 className="section-title">T4: Trade Plan</h3>
              <div className="trade-plan">
                <div><span>Entry</span><span>{stock.entryPrice?.toLocaleString('vi-VN')}</span></div>
                <div><span>Target</span><span>{stock.targetPrice?.toLocaleString('vi-VN')}</span></div>
                <div><span>Stop Loss</span><span>{stock.stopLoss?.toLocaleString('vi-VN')}</span></div>
                <div><span>Position</span><span>{stock.positionSize}%</span></div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(StockDetailModal);

