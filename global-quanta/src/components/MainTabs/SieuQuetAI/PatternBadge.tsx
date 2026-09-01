/**
 * PatternBadge.tsx
 * Hien thi pattern ky thuat: VCP, Wyckoff, Elliott Wave
 * Mo phong theo V11.0 Task 3
 */

import { memo } from 'react';

export type PatternType = 
  | 'VCP'           // Volatility Contraction Pattern
  | 'WYCKOFF_ACCUM' // Wyckoff Accumulation
  | 'WYCKOFF_DIST'  // Wyckoff Distribution
  | 'ELLIOTT_3'     // Elliott Wave 3
  | 'ELLIOTT_5'     // Elliott Wave 5
  | 'BREAKOUT'      // Price breakout
  | 'GOLDEN_CROSS'  // MA crossover bullish
  | 'DIV_RSI'       // RSI divergence
  | null;

export interface PatternData {
  type: PatternType;
  label: string;
  strength: number;  // 0-100
  targetPct: number | null;  // Price target %
  isBullish: boolean;
}

interface Props {
  pattern: PatternData | null;
  /** Compact mode */
  compact?: boolean;
}

function getPatternInfo(type: PatternType | null): {
  emoji: string;
  color: string;
  label: string;
} {
  switch (type) {
    case 'VCP':
      return { emoji: '📦', color: '#6BCB77', label: 'VCP' };
    case 'WYCKOFF_ACCUM':
      return { emoji: '📈', color: 'var(--positive)', label: 'Wyckoff A' };
    case 'WYCKOFF_DIST':
      return { emoji: '📉', color: 'var(--negative)', label: 'Wyckoff D' };
    case 'ELLIOTT_3':
      return { emoji: '🌊', color: 'var(--positive)', label: 'Wave 3' };
    case 'ELLIOTT_5':
      return { emoji: '🌊', color: '#FFD93D', label: 'Wave 5' };
    case 'BREAKOUT':
      return { emoji: '⚡', color: '#6BCB77', label: 'Breakout' };
    case 'GOLDEN_CROSS':
      return { emoji: '�️', color: 'var(--positive)', label: 'GoldenX' };
    case 'DIV_RSI':
      return { emoji: '📊', color: '#FF6B6B', label: 'Div RSI' };
    default:
      return { emoji: '➖', color: 'var(--text-tertiary)', label: 'None' };
  }
}

function PatternBadge({ pattern, compact = false }: Props) {
  if (!pattern) {
    return (
      <td className="pattern-cell">
        <span className="pattern-none">--</span>
      </td>
    );
  }

  const { emoji, color, label } = getPatternInfo(pattern.type);

  if (compact) {
    return (
      <td className="pattern-cell compact">
        <span 
          className="pattern-badge-compact"
          style={{ background: `${color}20`, color }}
          title={`${label} - ${pattern.strength}%`}
        >
          {emoji} {label}
        </span>
      </td>
    );
  }

  return (
    <td className="pattern-cell">
      <div className="pattern-info">
        <span 
          className="pattern-badge"
          style={{ background: `${color}20`, borderColor: color }}
        >
          {emoji} {label}
        </span>
        <div className="pattern-details">
          <span className="pattern-strength">
            Strength: {pattern.strength}%
          </span>
          {pattern.targetPct !== null && (
            <span className="pattern-target">
              Target: +{pattern.targetPct}%
            </span>
          )}
        </div>
      </div>
    </td>
  );
}

export default memo(PatternBadge);

// Utility: Generate mock pattern for demo
export function generateMockPattern(): PatternData | null {
  const patterns: (PatternType)[] = [
    'VCP', 'WYCKOFF_ACCUM', 'ELLIOTT_3', 'BREAKOUT', 'GOLDEN_CROSS'
  ];
  
  // 70% co pattern, 30% khong co
  if (Math.random() > 0.7) {
    return null;
  }

  const type = patterns[Math.floor(Math.random() * patterns.length)];
  const strength = Math.floor(Math.random() * 40) + 60; // 60-100
  
  let targetPct: number | null = null;
  let isBullish = true;

  switch (type) {
    case 'VCP':
      targetPct = Math.floor(Math.random() * 20) + 10;
      break;
    case 'WYCKOFF_ACCUM':
      targetPct = Math.floor(Math.random() * 25) + 15;
      break;
    case 'ELLIOTT_3':
      targetPct = Math.floor(Math.random() * 30) + 20;
      break;
    case 'ELLIOTT_5':
      targetPct = Math.floor(Math.random() * 10) + 5;
      isBullish = false;
      break;
    case 'WYCKOFF_DIST':
      targetPct = Math.floor(Math.random() * 15) + 10;
      isBullish = false;
      break;
  }

  return { type, label: type || '', strength, targetPct, isBullish };
}
