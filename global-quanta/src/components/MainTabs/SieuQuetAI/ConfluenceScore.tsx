/**
 * ConfluenceScore.tsx
 * Hien thi diem hoi tu 4 layers: Macro, Flow, Technical, Sentiment
 * Mo phong theo V11.0 Task 2
 */

import { memo } from 'react';

export interface ConfluenceData {
  ticker: string;
  macroScore: number;      // 0-25
  flowScore: number;       // 0-25
  technicalScore: number;   // 0-25
  sentimentScore: number;  // 0-25
  totalScore: number;      // 0-100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  signals: string[];
}

interface Props {
  data: ConfluenceData;
  /** Compact mode cho hien thi trong table */
  compact?: boolean;
  /** Show breakdown hay chi hien thi tong diem */
  showBreakdown?: boolean;
}

function ConfluenceScore({ data, compact = false, showBreakdown = false }: Props) {
  const { macroScore, flowScore, technicalScore, sentimentScore, totalScore, confidence, signals } = data;

  // Get color based on score
  const getScoreColor = (score: number) => {
    if (score >= 20) return 'var(--positive)';
    if (score >= 15) return '#6BCB77';
    if (score >= 10) return '#FFD93D';
    if (score >= 5) return '#FF6B6B';
    return 'var(--negative)';
  };

  // Get confidence badge
  const getConfidenceBadge = (conf: string) => {
    switch (conf) {
      case 'HIGH': return { emoji: '⚡', color: 'var(--positive)' };
      case 'MEDIUM': return { emoji: '➖', color: '#FFD93D' };
      default: return { emoji: '⚠️', color: 'var(--negative)' };
    }
  };

  const confBadge = getConfidenceBadge(confidence);

  if (compact) {
    return (
      <div className="confluence-compact">
        <div 
          className="confluence-score-circle"
          style={{ 
            borderColor: getScoreColor(totalScore),
            color: getScoreColor(totalScore)
          }}
        >
          {totalScore}
        </div>
        <span 
          className="confluence-conf-badge"
          style={{ color: confBadge.color }}
        >
          {confBadge.emoji}
        </span>
      </div>
    );
  }

  return (
    <div className="confluence-panel">
      <div className="confluence-header">
        <span className="confluence-title">Hoi Tu 4 Layers</span>
        <div className="confluence-total" style={{ color: getScoreColor(totalScore) }}>
          <span className="total-score">{totalScore}</span>
          <span 
            className="conf-badge"
            style={{ color: confBadge.color }}
          >
            {confBadge.emoji} {confidence}
          </span>
        </div>
      </div>

      {showBreakdown && (
        <div className="confluence-breakdown">
          <div className="layer-row">
            <span className="layer-label">Macro</span>
            <div className="layer-bar">
              <div 
                className="layer-fill"
                style={{ 
                  width: `${(macroScore / 25) * 100}%`,
                  background: getScoreColor(macroScore)
                }}
              />
            </div>
            <span className="layer-score">{macroScore}</span>
          </div>

          <div className="layer-row">
            <span className="layer-label">Flow</span>
            <div className="layer-bar">
              <div 
                className="layer-fill"
                style={{ 
                  width: `${(flowScore / 25) * 100}%`,
                  background: getScoreColor(flowScore)
                }}
              />
            </div>
            <span className="layer-score">{flowScore}</span>
          </div>

          <div className="layer-row">
            <span className="layer-label">Technical</span>
            <div className="layer-bar">
              <div 
                className="layer-fill"
                style={{ 
                  width: `${(technicalScore / 25) * 100}%`,
                  background: getScoreColor(technicalScore)
                }}
              />
            </div>
            <span className="layer-score">{technicalScore}</span>
          </div>

          <div className="layer-row">
            <span className="layer-label">Sentiment</span>
            <div className="layer-bar">
              <div 
                className="layer-fill"
                style={{ 
                  width: `${(sentimentScore / 25) * 100}%`,
                  background: getScoreColor(sentimentScore)
                }}
              />
            </div>
            <span className="layer-score">{sentimentScore}</span>
          </div>
        </div>
      )}

      {signals.length > 0 && (
        <div className="confluence-signals">
          {signals.map((signal, i) => (
            <span key={i} className="signal-badge">{signal}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(ConfluenceScore);

// Utility: Generate mock confluence data for demo
export function generateMockConfluence(ticker: string): ConfluenceData {
  // Generate random but realistic scores
  const macro = Math.floor(Math.random() * 15) + 10;
  const flow = Math.floor(Math.random() * 15) + 10;
  const technical = Math.floor(Math.random() * 18) + 7;
  const sentiment = Math.floor(Math.random() * 12) + 8;
  const total = macro + flow + technical + sentiment;

  const scores = [macro, flow, technical, sentiment];
  const avg = total / 4;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / 4;
  const stdDev = Math.sqrt(variance);

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (stdDev < 4) confidence = 'HIGH';
  else if (stdDev < 8) confidence = 'MEDIUM';
  else confidence = 'LOW';

  const signals: string[] = [];
  if (macro >= 20) signals.push('Macro manh');
  if (flow >= 20) signals.push('Dong tien tot');
  if (technical >= 20) signals.push('Breakout');
  if (sentiment >= 20) signals.push('Tin tich cuc');

  return {
    ticker,
    macroScore: macro,
    flowScore: flow,
    technicalScore: technical,
    sentimentScore: sentiment,
    totalScore: total,
    confidence,
    signals
  };
}
