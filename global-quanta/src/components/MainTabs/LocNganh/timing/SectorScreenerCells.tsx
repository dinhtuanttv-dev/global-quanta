// Port từ locnganh-timing-engine (ui/sector-rotation/SectorScreenerCells.tsx).
import type { SectorTimingSignal } from '../../../../lib/locnganh/types';

/**
 * 4 ô bổ sung cho bảng 8 cột đã có trong LocNganhPanel (Mã, Ngành, RRG, RS, Vol, PVT, A/D,
 * Confluence — mục 3 tài liệu kế hoạch gốc). Nhận thẳng SectorTimingSignal từ
 * useSectorTimingSignals — không tự fetch, gắn thẳng vào <tr> hiện có.
 */

const CONFIDENCE_LABEL: Record<NonNullable<SectorTimingSignal['confidence']>, string> = { HIGH: 'Cao', MEDIUM: 'TB', LOW: 'Thấp' };

function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(digits).replace('.', ',') + '%';
}

export function SectorOptimalWindowCell({ signal }: { signal: SectorTimingSignal }) {
  if (!signal.window) {
    return (
      <span data-testid="sector-window-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12, whiteSpace: 'nowrap' }}>
        {signal.action === 'NO_DATE' ? 'Chưa có dữ liệu RRG' : 'Chưa đủ bằng chứng'}
      </span>
    );
  }
  const { entryFrom, entryTo, exitOffset } = signal.window;
  const active = signal.action === 'IN_WINDOW';
  return (
    <span data-testid="sector-window-cell" title={`Mua trong [${entryFrom}, ${entryTo}] ngày GD quanh lần chuyển quadrant, thoát tại ${exitOffset}`} style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--ct-buy, #1e9e5a)' : undefined, whiteSpace: 'nowrap' }}>
      [{entryFrom}, {entryTo}] → {exitOffset}
    </span>
  );
}

export function SectorExpectedReturnCell({ signal }: { signal: SectorTimingSignal }) {
  if (signal.expectedNetReturn === null) {
    return <span data-testid="sector-return-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>N/A</span>;
  }
  const tip = signal.nEvents !== null && signal.fdrQValue !== null ? `${signal.nEvents} lần chuyển quadrant, q=${signal.fdrQValue.toFixed(2).replace('.', ',')}` : undefined;
  const positive = signal.expectedNetReturn > 0;
  return (
    <span data-testid="sector-return-cell" title={tip} style={{ fontSize: 12, fontWeight: 600, color: positive ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-today, #d6336c)' }}>
      {fmtPct(signal.expectedNetReturn)}
    </span>
  );
}

export function SectorConfidenceBadge({ signal }: { signal: SectorTimingSignal }) {
  if (!signal.confidence) {
    return <span data-testid="sector-confidence-badge" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>—</span>;
  }
  const bg = signal.confidence === 'HIGH' ? 'var(--ct-buy, #1e9e5a)' : signal.confidence === 'MEDIUM' ? 'var(--ct-warn, #c47a00)' : 'var(--ct-muted, #5d6b78)';
  return (
    <span data-testid="sector-confidence-badge" style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: bg, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {CONFIDENCE_LABEL[signal.confidence]}
      {signal.nEvents !== null && ` · ${signal.nEvents}`}
    </span>
  );
}

/** Thay cho cột "KQKD" của cotuc — ở đây là xác suất Bayes outperform benchmark. */
export function SectorReactionProbabilityCell({ signal }: { signal: SectorTimingSignal }) {
  if (!signal.reactionProbability) {
    return <span data-testid="sector-prob-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>N/A</span>;
  }
  const { mean, ci } = signal.reactionProbability;
  const color = mean >= 0.6 ? 'var(--ct-buy, #1e9e5a)' : mean <= 0.4 ? 'var(--ct-today, #d6336c)' : 'var(--ct-muted, #5d6b78)';
  return (
    <span data-testid="sector-prob-cell" title={`Khoảng tin cậy: ${fmtPct(ci[0], 0)} – ${fmtPct(ci[1], 0)}`} style={{ fontSize: 12, color }}>
      {fmtPct(mean, 0)}
    </span>
  );
}

export function SectorScreenerCells({ signal }: { signal: SectorTimingSignal }) {
  return (
    <>
      <td><SectorOptimalWindowCell signal={signal} /></td>
      <td><SectorExpectedReturnCell signal={signal} /></td>
      <td><SectorConfidenceBadge signal={signal} /></td>
      <td><SectorReactionProbabilityCell signal={signal} /></td>
    </>
  );
}
