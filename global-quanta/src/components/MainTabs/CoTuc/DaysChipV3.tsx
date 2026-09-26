import type { TimingAction, DataStatus, EarningsImpact } from '../../../lib/quant-cotuc';

/**
 * DaysChip mở rộng (mục 11.2 tài liệu v3):
 * - Hiển thị NGÀY GIAO DỊCH còn lại, tooltip ngày lịch.
 * - `IN_WINDOW` → viền xanh, nhãn "Trong cửa sổ" (KHÔNG nhấp nháy "MUA" như v2 — hàm ý ra lệnh).
 * - Chip thứ hai cho ngày thanh toán (dùng lại DaysChip với label khác).
 * - Badge ⚡ khi xung đột KQKD, badge ⌛ khi ngày chưa CONFIRMED.
 */

export function formatTradingDaysRemaining(td: number | null): string {
  if (td === null) return '—';
  if (td === 0) return 'Hôm nay';
  if (td > 0) return `còn ${td} ngày GD`;
  return `qua ${-td} ngày GD`;
}

export interface DaysChipV3Props {
  /** Nhãn ngắn: 'GDKHQ', 'Thanh toán', 'ĐHCĐ'... */
  label: string;
  /** Số ngày giao dịch còn lại tới mốc này (âm = đã qua). null nếu chưa có ngày. */
  tdToTarget: number | null;
  /** Ngày lịch tương ứng, hiện trong tooltip. */
  calendarDate?: string | null;
  /** true khi mốc này đang là GDKHQ và đang trong vùng mua — viền xanh, nhãn "Trong cửa sổ". */
  highlightInWindow?: boolean;
  /** Độ tin cậy của ngày — khác CONFIRMED thì hiện badge ⌛. */
  dateStatus?: DataStatus | null;
}

/** Một chip đơn cho một mốc ngày (GDKHQ, ĐHCĐ, hoặc Thanh toán). */
export function DaysChipV3({ label, tdToTarget, calendarDate, highlightInWindow, dateStatus }: DaysChipV3Props) {
  const estimated = dateStatus != null && dateStatus !== 'CONFIRMED';
  return (
    <span
      data-testid="days-chip"
      title={calendarDate ? `${label}: ${calendarDate}` : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        borderRadius: 999,
        padding: '2px 8px',
        border: `1px solid ${highlightInWindow ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-grid, #dde3e9)'}`,
        color: highlightInWindow ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-fg, currentColor)',
        fontWeight: highlightInWindow ? 600 : 400,
      }}
    >
      {label}: {highlightInWindow ? 'Trong cửa sổ' : formatTradingDaysRemaining(tdToTarget)}
      {estimated && (
        <span data-testid="days-chip-estimated" title="Ngày chưa được xác nhận, có thể thay đổi" aria-label="ngày dự kiến">
          ⌛
        </span>
      )}
    </span>
  );
}

/** Badge riêng cho xung đột KQKD–GDKHQ, dùng cạnh cặp DaysChip. */
export function EarningsConflictBadge({ conflict }: { conflict: EarningsImpact['conflict'] }) {
  if (conflict === 'NONE') return null;
  const text = conflict === 'NEAR_EX' ? 'Xung đột KQKD sát GDKHQ' : 'KQKD trong thời gian nắm giữ';
  return (
    <span
      data-testid="earnings-conflict-badge"
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--ct-warn, #c47a00)',
        borderRadius: 999,
        padding: '2px 7px',
      }}
    >
      ⚡ Xung đột KQKD
    </span>
  );
}

export interface EventDaysChipsV3Props {
  action: TimingAction;
  tdToEx: number | null;
  tdToPayment: number | null;
  exDateStatus?: DataStatus | null;
  exDateIso?: string | null;
  paymentDateIso?: string | null;
  earningsConflict: EarningsImpact['conflict'];
}

/**
 * Cặp chip GDKHQ + Thanh toán, cộng badge xung đột KQKD nếu có — ghép đúng bố cục mục 11.2:
 * "Thêm paymentDate chip thứ 2... Nếu earningsImpact.conflict → thêm badge".
 */
export function EventDaysChipsV3({ action, tdToEx, tdToPayment, exDateStatus, exDateIso, paymentDateIso, earningsConflict }: EventDaysChipsV3Props) {
  return (
    <span data-testid="event-days-chips" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <DaysChipV3 label="GDKHQ" tdToTarget={tdToEx} calendarDate={exDateIso} dateStatus={exDateStatus} highlightInWindow={action === 'IN_WINDOW'} />
      <DaysChipV3 label="Thanh toán" tdToTarget={tdToPayment} calendarDate={paymentDateIso} />
      <EarningsConflictBadge conflict={earningsConflict} />
    </span>
  );
}
