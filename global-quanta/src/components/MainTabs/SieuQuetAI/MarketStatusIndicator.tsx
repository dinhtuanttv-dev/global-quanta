/**
 * MarketStatusIndicator.tsx
 * Hien thi trang thai thi truong toan cuc: Bull, Bear, Neutral
 * Su dung du lieu tu Yahoo Finance
 */

import { memo } from 'react';

export type MarketRegime = 'BULL' | 'BEAR' | 'NEUTRAL';

interface MarketStatusData {
  regime: MarketRegime;
  vnIndex: number | null;
  vnIndexChange: number | null;
  globalStrength: number;
  sentiment: number;
  lastUpdated: Date | null;
}

interface Props {
  data: MarketStatusData;
  compact?: boolean;
}

function getRegimeInfo(regime: MarketRegime) {
  switch (regime) {
    case 'BULL':
      return { emoji: '🐂', label: 'BULL', color: 'var(--positive)', bg: 'rgba(107,203,119,0.15)' };
    case 'BEAR':
      return { emoji: '🐻', label: 'BEAR', color: 'var(--negative)', bg: 'rgba(255,107,107,0.15)' };
    default:
      return { emoji: '⚖️', label: 'NEUTRAL', color: 'var(--text-secondary)', bg: 'rgba(255,217,61,0.1)' };
  }
}

function MarketStatusIndicator({ data, compact = false }: Props) {
  const regimeInfo = getRegimeInfo(data.regime);

  if (compact) {
    return (
      <div 
        className="market-status-compact"
        style={{ background: regimeInfo.bg, borderColor: regimeInfo.color }}
        title={`Market: ${regimeInfo.label}`}
      >
        <span className="status-emoji">{regimeInfo.emoji}</span>
        <span className="status-label" style={{ color: regimeInfo.color }}>
          {regimeInfo.label}
        </span>
      </div>
    );
  }

  return (
    <div className="market-status-panel">
      <div className="status-header">
        <span className="status-title">GLOBAL MARKET</span>
        {data.lastUpdated && (
          <span className="status-time">
            {data.lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="status-main" style={{ background: regimeInfo.bg }}>
        <span className="status-emoji-large">{regimeInfo.emoji}</span>
        <span className="status-label-large" style={{ color: regimeInfo.color }}>
          {regimeInfo.label}
        </span>
      </div>

      <div className="status-metrics">
        <div className="metric-row">
          <span className="metric-label">VN-Index</span>
          <span className="metric-value">
            {data.vnIndex !== null 
              ? data.vnIndex.toLocaleString('vi-VN', { minimumFractionDigits: 2 })
              : '--'}
          </span>
          <span className={`metric-change ${(data.vnIndexChange ?? 0) >= 0 ? 'up' : 'down'}`}>
            {(data.vnIndexChange ?? 0) >= 0 ? '+' : ''}
            {(data.vnIndexChange ?? 0).toFixed(2)}%
          </span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Global</span>
          <div className="metric-bar">
            <div 
              className="metric-bar-fill"
              style={{ width: `${data.globalStrength}%` }}
            />
          </div>
          <span className="metric-value">{data.globalStrength}</span>
        </div>
      </div>
    </div>
  );
}

export default memo(MarketStatusIndicator);

export function calculateMarketRegime(
  vnIndexChange: number | null,
  globalIndices: { symbol: string; changePct: number }[]
): MarketRegime {
  const avgGlobalChange = globalIndices.length > 0
    ? globalIndices.reduce((sum, idx) => sum + idx.changePct, 0) / globalIndices.length
    : 0;

  const vnChange = vnIndexChange ?? 0;
  const combinedScore = vnChange + avgGlobalChange * 0.5;

  if (combinedScore > 1.5) return 'BULL';
  if (combinedScore < -1.5) return 'BEAR';
  return 'NEUTRAL';
}
