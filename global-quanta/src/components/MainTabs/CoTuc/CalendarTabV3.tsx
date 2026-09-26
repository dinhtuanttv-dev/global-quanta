import { useMemo, useState } from 'react';
import type { Deps, DataStatus, ISODate, Sourced } from '../../../lib/quant-cotuc';
import { detectUpcomingDividendEvents, detectUpcomingEarningsEvents } from '../../../lib/quant-cotuc';
import type { AnnounceMethod, EarningsSignal } from '../../../lib/cotuc/timing-types';
import { formatTradingDaysRemaining } from './DaysChipV3';

/**
 * Sub-tab Calendar (mục 11.4 tài liệu v3): hai danh sách "Sắp GDKHQ" / "Sắp KQKD", dùng
 * detectUpcomingDividendEvents/detectUpcomingEarningsEvents (hàm thuần trong core/quant-cotuc.ts).
 * Component KHÔNG tự fetch — nhận `dividendItems`/`earningsItems` từ dữ liệu đã có sẵn trong
 * CotucTab (mergedStocks, earningsMap — đúng fallback mục 10 "Rủi ro & Mitigation" của tài
 * liệu v3: "Backend không có endpoint riêng theo ticker ⇒ dùng earningsMap toàn cảnh đã có").
 */

const DATE_STATUS_LABEL: Record<DataStatus, string> = {
  CONFIRMED: 'Xác nhận',
  ANNOUNCED: 'Công bố',
  ESTIMATED: 'Ước tính',
};

const ANNOUNCE_METHOD_LABEL: Record<AnnounceMethod, string> = {
  CONFIRMED: 'Xác nhận',
  HISTORICAL_LAG: 'Ước tính (độ trễ lịch sử)',
  DEADLINE_ONLY: 'Ước tính (hạn pháp lý)',
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
  earningsItems: EarningsSignal[];
  deps: Deps;
  /** Số ngày giao dịch nhìn về phía trước. Mặc định lấy từ deps.cfg.horizonTd (30). */
  horizonTd?: number;
  className?: string;
}

export function CalendarTabV3({ dividendItems, earningsItems, deps, horizonTd, className }: CalendarTabProps) {
  const [tab, setTab] = useState<'dividends' | 'earnings'>('dividends');

  const upcomingDividends = useMemo(
    () => detectUpcomingDividendEvents(dividendItems, deps, horizonTd),
    [dividendItems, deps, horizonTd],
  );
  const upcomingEarnings = useMemo(() => detectUpcomingEarningsEvents(earningsItems, deps, horizonTd), [earningsItems, deps, horizonTd]);

  return (
    <section className={className} aria-label="Lịch sự kiện sắp tới">
      <div role="tablist" aria-label="Chọn loại sự kiện" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'dividends'}
          data-testid="tab-dividends"
          onClick={() => setTab('dividends')}
          style={{
            fontSize: 13,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--ct-grid, #dde3e9)',
            background: tab === 'dividends' ? 'var(--ct-line, #0d6b8f)' : 'transparent',
            color: tab === 'dividends' ? '#fff' : 'var(--ct-fg, currentColor)',
            cursor: 'pointer',
          }}
        >
          📅 Sắp GDKHQ ({upcomingDividends.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'earnings'}
          data-testid="tab-earnings"
          onClick={() => setTab('earnings')}
          style={{
            fontSize: 13,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--ct-grid, #dde3e9)',
            background: tab === 'earnings' ? 'var(--ct-line, #0d6b8f)' : 'transparent',
            color: tab === 'earnings' ? '#fff' : 'var(--ct-fg, currentColor)',
            cursor: 'pointer',
          }}
        >
          📋 Sắp KQKD ({upcomingEarnings.length})
        </button>
      </div>

      {tab === 'dividends' ? (
        <div role="tabpanel" data-testid="panel-dividends">
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
      ) : (
        <div role="tabpanel" data-testid="panel-earnings">
          {upcomingEarnings.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ct-muted, #5d6b78)' }}>Không có mã nào sắp công bố KQKD trong khoảng thời gian này.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }} data-testid="earnings-list">
              {upcomingEarnings.map((e) => (
                <li key={e.ticker} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--ct-grid, #dde3e9)' }}>
                  <strong>{e.ticker}</strong>
                  <span>{e.quarterLabel}</span>
                  <span>{formatTradingDaysRemaining(e.tdToEarnings)}</span>
                  <StatusPill text={ANNOUNCE_METHOD_LABEL[e.method]} confirmed={e.method === 'CONFIRMED'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default CalendarTabV3;
