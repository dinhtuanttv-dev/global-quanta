/**
 * RSRating.tsx
 * RS Rating - Relative Strength Rating
 * Mo phong theo V11.0 Task 3
 */

import { memo } from 'react';

export interface RSRatingData {
  ticker: string;
  rsRating: number;      // 0-100
  rs4Week: number;       // 4-week RS
  rs12Week: number;      // 12-week RS
  rs26Week: number;      // 26-week RS
  percentile: number;     // Top X%
  isElite: boolean;       // RS > 80
}

interface Props {
  data: RSRatingData | null;
  /** Compact mode */
  compact?: boolean;
}

function RSRating({ data, compact = false }: Props) {
  if (!data) {
    return (
      <td className="rs-cell">
        <span className="rs-none">--</span>
      </td>
    );
  }

  const { rsRating, isElite } = data;

  // Get color based on RS
  const getRSColor = (rs: number) => {
    if (rs >= 80) return 'var(--positive)';
    if (rs >= 60) return '#6BCB77';
    if (rs >= 40) return '#FFD93D';
    if (rs >= 20) return '#FF6B6B';
    return 'var(--negative)';
  };

  const rsColor = getRSColor(rsRating);

  if (compact) {
    return (
      <td className="rs-cell compact">
        <span 
          className={`rs-badge-compact ${isElite ? 'elite' : ''}`}
          style={{ 
            background: isElite ? 'rgba(107,203,119,0.2)' : 'transparent',
            color: rsColor 
          }}
          title={`RS: ${rsRating} (${data.percentile}% ile)`}
        >
          {isElite && <span className="elite-star">⭐</span>}
          {rsRating}
        </span>
      </td>
    );
  }

  return (
    <td className="rs-cell">
      <div className="rs-info">
        <div className="rs-main">
          <span 
            className={`rs-value ${isElite ? 'elite' : ''}`}
            style={{ color: rsColor }}
          >
            {isElite && <span className="elite-star">⭐</span>}
            {rsRating}
          </span>
          <span className="rs-label">RS</span>
        </div>
        
        <div className="rs-periods">
          <span className="period" title="4-week RS">4W: {data.rs4Week}</span>
          <span className="period" title="12-week RS">12W: {data.rs12Week}</span>
        </div>
      </div>
    </td>
  );
}

export default memo(RSRating);

// Utility: Generate mock RS rating
export function generateMockRSRating(ticker: string): RSRatingData {
  // Generate RS that tends to be high for top stocks
  const rsRating = Math.floor(Math.random() * 50) + 40; // 40-90
  
  const rs4Week = Math.min(100, Math.max(0, rsRating + Math.floor(Math.random() * 20) - 10));
  const rs12Week = Math.min(100, Math.max(0, rsRating + Math.floor(Math.random() * 20) - 10));
  const rs26Week = Math.min(100, Math.max(0, rsRating + Math.floor(Math.random() * 20) - 10));
  
  const percentile = Math.max(1, Math.min(99, 101 - rsRating));
  
  return {
    ticker,
    rsRating,
    rs4Week,
    rs12Week,
    rs26Week,
    percentile,
    isElite: rsRating >= 80
  };
}
