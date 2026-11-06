import { useMemo } from 'react';
import type { Deps, DataStatus, ISODate, Sourced } from '../../../lib/quant-cotuc';
import { detectUpcomingDividendEvents } from '../../../lib/quant-cotuc';
import { formatTradingDaysRemaining } from './DaysChipV3';

/**
 * Sub-tab Lịch sự kiện (mục 11.4 tài liệu v3): danh sách "Sắp GDKHQ", dùng detectUpcomingDividendEvents (hàm thuần trong
 * core/quant-cotuc.ts). Component KHÔNG tự fetch — nhận `dividendItems` từ dữ liệu đã có sẵn trong CotucTab.
 * LC5 (06/11/2026): danh sách "Sắp KQKD" cũ (Project A earnings-signals, 30 phiên) đã gỡ — thay bằng Lịch công bố KQKD
 * (tab Kết quả kinh doanh, Gateway /api/fundamentals/kqkd/calendar).
 */

const DATE_STATUS_LABEL: Record<DataStatus, string> = {
  CONFIRMED: 'Xác nhận',
  ANNOUNCED: 'Công bố',
  ESTIMATED: 'Ước tính',
};

function StatusPill({ text, confirmed }: { text: string; confirmed: boolean }) {
  return (
    <span
      style={{
        fontSize: 11,
        borderRadius: 999,
        padding: '1px 7px',
        border: `1px solid ${confirmed ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-grid, #dde3e9)'}`,
        color: confirmed ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-muted, #5d6b78)',
      }}
    >
      {text}
    </span>
  );
}

export interface DividendCalendarItem {
  ticker: string;
  exDate: Sourced<ISODate> | null;
  cashPerShare: number | null;
}

export interface CalendarTabProps {
  dividendItems: DividendCalendarItem[];
  deps: Deps;
  /** Số ngày giao dịch nhìn về phía trước. Mặc định lấy từ deps.cfg.horizonTd (30). */
  horizonTd?: number;
  className?: string;
}

export function CalendarTabV3({ dividendItems, deps, horizonTd, className }: CalendarTabProps) {
  const upcomingDividends = useMemo(
    () => detectUpcomingDividendEvents(dividendItems, deps, horizonTd),
    [dividendItems, deps, horizonTd],
  );

  return (
    <section className={className} aria-label="Lịch sự kiện sắp tới">
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }} data-testid="tab-dividends">📅 Sắp GDKHQ ({upcomingDividends.length})</p>
      <div role="region" data-testid="panel-dividends">
        {upcomingDividends.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ct-muted, #5d6b78)' }}>Không có mã nào sắp GDKHQ trong khoảng thời gian này.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }} data-testid="dividends-list">
            {upcomingDividends.map((d) => (
              <li key={d.ticker} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--ct-grid, #dde3e9)' }}>
                <strong>{d.ticker}</strong>
                <span>{formatTradingDaysRemaining(d.tdToEx)}</span>
                <span>{d.cashPerShare !== null ? `${d.cashPerShare.toLocaleString('vi-VN')} đ/CP` : 'N/A'}</span>
                <StatusPill text={DATE_STATUS_LABEL[d.status]} confirmed={d.status === 'CONFIRMED'} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p style={{ fontSize: 11, marginTop: 8, color: 'var(--ct-muted, #5d6b78)' }}>Lịch công bố KQKD: xem tab Kết quả kinh doanh › 📋 Lịch công bố KQKD.</p>
    </section>
  );
}

export default CalendarTabV3;
