import type { TimingSignal } from '../../../lib/cotuc/timing-types';

/**
 * Các ô cho 4 cột mới của Screener (mục 11.1 tài liệu v3): "Cửa sổ tối ưu", "Kỳ vọng ròng",
 * "Tin cậy", "KQKD". Nhận thẳng một `TimingSignal` (từ useTimingSignalsBulk — một request cho
 * cả vũ trụ, xem hooks/useTimingSignalsBulk.ts) nên không tự fetch gì, gắn thẳng vào ô `<td>`
 * đang có trong bảng Screener hiện tại.
 */

const CONFIDENCE_LABEL: Record<NonNullable<TimingSignal['confidence']>, string> = {
  HIGH: 'Cao',
  MEDIUM: 'TB',
  LOW: 'Thấp',
};

function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(digits).replace('.', ',') + '%';
}

/** Cột "Cửa sổ tối ưu": entryFrom → entryTo, exitOffset. "Chưa đủ dữ liệu" khi NO_SIGNAL/window null. */
export function OptimalWindowCell({ signal }: { signal: TimingSignal }) {
  if (!signal.window) {
    return (
      <span data-testid="optimal-window-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>
        {signal.action === 'NO_DATE' ? 'Chưa có ngày' : 'Chưa đủ dữ liệu'}
      </span>
    );
  }
  const { entryFrom, entryTo, exitOffset } = signal.window;
  const active = signal.action === 'IN_WINDOW';
  return (
    <span
      data-testid="optimal-window-cell"
      title={`Mua trong [${entryFrom}, ${entryTo}] ngày GD trước GDKHQ, thoát tại ${exitOffset}`}
      style={{
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--ct-buy, #1e9e5a)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      [{entryFrom}, {entryTo}] → {exitOffset}
    </span>
  );
}

/** Cột "Kỳ vọng ròng": expectedNetReturn (cận dưới), tooltip số mẫu + q-value. */
export function ExpectedReturnCell({ signal }: { signal: TimingSignal }) {
  if (signal.expectedNetReturn === null) {
    return (
      <span data-testid="expected-return-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>
        N/A
      </span>
    );
  }
  const tip =
    signal.nEvents !== null && signal.fdrQValue !== null
      ? `${signal.nEvents} sự kiện, q=${signal.fdrQValue.toFixed(2).replace('.', ',')}`
      : undefined;
  const positive = signal.expectedNetReturn > 0;
  return (
    <span
      data-testid="expected-return-cell"
      title={tip}
      style={{ fontSize: 12, fontWeight: 600, color: positive ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-today, #d6336c)' }}
    >
      {fmtPct(signal.expectedNetReturn)}
    </span>
  );
}

/** Cột "Tin cậy": badge HIGH/MEDIUM/LOW, kèm số sự kiện. */
export function ConfidenceBadge({ signal }: { signal: TimingSignal }) {
  if (!signal.confidence) {
    return (
      <span data-testid="confidence-badge" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>
        —
      </span>
    );
  }
  const bg = signal.confidence === 'HIGH' ? 'var(--ct-buy, #1e9e5a)' : signal.confidence === 'MEDIUM' ? 'var(--ct-warn, #c47a00)' : 'var(--ct-muted, #5d6b78)';
  return (
    <span
      data-testid="confidence-badge"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        background: bg,
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {CONFIDENCE_LABEL[signal.confidence]}
      {signal.nEvents !== null && ` · ${signal.nEvents}`}
    </span>
  );
}

/** Cột "KQKD": tăng trưởng YoY, màu xanh/đỏ theo dấu, XÁM khi null (không phải 0 — mục 11.1). */
export function EarningsGrowthCell({ signal }: { signal: TimingSignal }) {
  const g = signal.earnings?.profitGrowthYoY ?? signal.earnings?.revenueGrowthYoY ?? null;
  if (g === null) {
    return (
      <span data-testid="earnings-growth-cell" style={{ color: 'var(--ct-muted, #5d6b78)', fontSize: 12 }}>
        N/A
      </span>
    );
  }
  const color = g > 0 ? 'var(--ct-buy, #1e9e5a)' : g < 0 ? 'var(--ct-today, #d6336c)' : 'var(--ct-muted, #5d6b78)';
  const conflict = signal.earnings?.conflict !== 'NONE';
  return (
    <span data-testid="earnings-growth-cell" style={{ fontSize: 12, color }}>
      {fmtPct(g, 0)}
      {conflict && (
        <span data-testid="earnings-conflict-flag" title="KQKD dự kiến sát/nằm trong thời gian nắm giữ" style={{ marginLeft: 4 }}>
          ⚡
        </span>
      )}
    </span>
  );
}

/** Gộp 4 ô lại thành 4 <td> — dùng khi muốn chèn nguyên một nhóm cột vào <tr> hiện có. */
export function ScreenerTimingCells({ signal }: { signal: TimingSignal }) {
  return (
    <>
      <td>
        <OptimalWindowCell signal={signal} />
      </td>
      <td>
        <ExpectedReturnCell signal={signal} />
      </td>
      <td>
        <ConfidenceBadge signal={signal} />
      </td>
      <td>
        <EarningsGrowthCell signal={signal} />
      </td>
    </>
  );
}
