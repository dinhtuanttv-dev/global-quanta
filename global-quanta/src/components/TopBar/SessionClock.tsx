// TOPBAR — đồng hồ phiên (spec §6.6): pha VN từ lịch Gateway (ATO / khớp liên tục / nghỉ trưa / ATC / ngày nghỉ) + HK / US theo
// múi giờ IANA. Đếm ngược tới lần chuyển pha kế tiếp; tự làm mới đúng lúc chuyển pha (không phụ thuộc lúc mở trang).
import { useEffect, useState } from 'react';
import type { Block, SessionData } from '../../hooks/useTopbar';

const ON = new Set(['open', 'auction']);

function untilText(iso: string | null, nowMs: number) {
  if (!iso) return null;
  const m = Math.round((Date.parse(iso) - nowMs) / 60_000);
  if (!Number.isFinite(m) || m < 0) return null;
  return m >= 60 ? `${Math.floor(m / 60)}g${String(m % 60).padStart(2, '0')}` : `${m}p`;
}

/** Đồng hồ cục bộ: nhảy mỗi 30 giây và ĐÚNG lúc chuyển pha kế tiếp của VN. */
function useNow(next: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    const ms = next ? Date.parse(next) - Date.now() : NaN;
    const t = Number.isFinite(ms) && ms > 0 && ms < 6 * 3600_000 ? window.setTimeout(() => setNow(Date.now()), ms + 500) : undefined;
    return () => { window.clearInterval(id); if (t) window.clearTimeout(t); };
  }, [next]);
  return now;
}

export default function SessionClock({ block, detailed = false }: { block: Block<{ VN: SessionData; HK: SessionData; US: SessionData }>; detailed?: boolean }) {
  const s = block.data;
  const now = useNow(s?.VN.nextTransitionAt ?? null);
  if (!s) return <div className="sessions" data-testid="tb-sessions"><span className="session">Phiên —</span></div>;
  const rows: [string, SessionData][] = [['VN', s.VN], ['HK', s.HK], ['US', s.US]];
  return (
    <div className={`sessions ${detailed ? 'sessions-detailed' : ''}`} data-testid="tb-sessions">
      {rows.map(([name, x]) => {
        const left = untilText(x.nextTransitionAt, now);
        const label = `${name} (${x.exchange}): ${x.label}${left ? `, còn ${left} tới lần chuyển pha` : ''}${x.note ? ` — ${x.note}` : ''}`;
        return (
          <div className="session" key={name} title={label} aria-label={label}>
            <span className={`sd ${ON.has(x.phase) ? 'on' : x.phase === 'break' || x.phase === 'pre_open' ? 'mid' : 'off'}`} aria-hidden />
            {name}
            {(name === 'VN' || detailed) && <span className="session-phase">{x.label}{left && ON.has(x.phase) ? ` · ${left}` : ''}</span>}
          </div>
        );
      })}
    </div>
  );
}
