import type { AlertsPayload, CalendarPayload } from './types';

const LEVEL_VI = { high: 'Cao', warn: 'Lưu ý', info: 'Thông tin' } as const;

export function MacroCalendar({ calendar, alerts, calendarError, alertsError }: {
  calendar: CalendarPayload | null;
  alerts: AlertsPayload | null;
  calendarError?: string | null;
  alertsError?: string | null;
}) {
  return (
    <div>
      <h2>Cảnh báo</h2>
      {alertsError ? <p className="state" role="alert">{alertsError}</p> : !alerts ? <p className="state" role="status">Đang tải cảnh báo…</p> : alerts.alerts.length === 0 ? (
        <p className="muted">Không có cảnh báo: các biến vĩ mô đang trong vùng bình thường và chế độ không đổi.</p>
      ) : (
        <ul className="alerts">
          {alerts.alerts.map((a) => (<li key={a.id} data-level={a.level}><strong>{LEVEL_VI[a.level]}.</strong> {a.messageVi}</li>))}
        </ul>
      )}
      <h2 style={{ marginTop: 16 }}>Lịch công bố số liệu</h2>
      {calendarError ? <p className="state" role="alert">{calendarError}</p> : !calendar ? <p className="state" role="status">Đang tải lịch…</p> : (
        <>
          <ul className="cal">
            {calendar.releases.slice(0, 8).map((r) => (
              <li key={r.seriesId}>
                <time dateTime={r.expectedDate}>{r.expectedDate.slice(8, 10)}/{r.expectedDate.slice(5, 7)}</time>
                <span>{r.nameVi} (kỳ {r.period})</span>
                <span className={r.status === 'overdue' ? 'late' : 'muted'}>{r.status === 'overdue' ? `chậm ${-r.daysUntil} ngày` : `còn ${r.daysUntil} ngày`}</span>
              </li>
            ))}
          </ul>
          <p className="muted">{calendar.caveat}</p>
        </>
      )}
    </div>
  );
}
