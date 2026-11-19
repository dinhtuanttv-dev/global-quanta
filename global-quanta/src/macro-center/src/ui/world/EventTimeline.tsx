// W2 (19/11/2026) — dòng thời gian ngang của các nghiên cứu sự kiện thế giới (GET /api/world/events), cùng bộ lọc với danh sách.
// Trục ngang = phiên phản ứng; chấm trên đường giữa = CAR (−1,+3) dương, dưới = âm, trên đường = chưa đo. Hình dạng theo bậc
// bằng chứng (A/B đặc, C rỗng, chờ đo nét đứt) — màu không thay cho bậc. Bấm chấm = mở chi tiết như bấm dòng trong bảng.
import { useMemo } from 'react';
import type { EventRow } from './EventPanels';
import { fmtSigned } from '../../world-view';

export interface EventFilter { region: string; kind: 'all' | 'scheduled' | 'surprise'; tier: 'all' | 'A' | 'B' | 'C' | 'pending' }
export const DEFAULT_EVENT_FILTER: EventFilter = { region: 'all', kind: 'all', tier: 'all' };
export const isEventFilter = (v: unknown): v is EventFilter => !!v && typeof v === 'object'
  && typeof (v as EventFilter).region === 'string'
  && ['all', 'scheduled', 'surprise'].includes((v as EventFilter).kind)
  && ['all', 'A', 'B', 'C', 'pending'].includes((v as EventFilter).tier);

export function filterEvents<T extends EventRow>(rows: T[], f: EventFilter): T[] {
  return rows.filter((e) => (f.region === 'all' || e.region === f.region) && (f.kind === 'all' || e.kind === f.kind) && (f.tier === 'all' || e.tier === f.tier));
}

const REGION_VI: Record<string, string> = { US: 'Mỹ', CN: 'Trung Quốc', EU: 'Châu Âu', JP: 'Nhật Bản', GLOBAL: 'Toàn cầu' };
const regionVi = (r: string) => REGION_VI[r] ?? r;
const TIER_VI: Record<string, string> = { all: 'Tất cả', A: 'Bậc A', B: 'Bậc B', C: 'Bậc C', pending: 'Chờ đo' };

export function EventFilterBar(props: { state: EventFilter; onChange: (f: EventFilter) => void; regions: string[]; shown: number; total: number }) {
  const { state, onChange } = props;
  return (
    <form className="fbar" aria-label="Bộ lọc sự kiện" onSubmit={(e: { preventDefault(): void }) => e.preventDefault()} data-testid="event-filter">
      <div className="frow">
        <label className="flabel" htmlFor="wd-ev-region">Khu vực</label>
        <select id="wd-ev-region" value={state.region} onChange={(e: { target: { value: string } }) => onChange({ ...state, region: e.target.value })}>
          <option value="all">Tất cả</option>
          {props.regions.map((r) => <option key={r} value={r}>{regionVi(r)}</option>)}
        </select>
        <label className="flabel" htmlFor="wd-ev-kind">Loại</label>
        <select id="wd-ev-kind" value={state.kind} onChange={(e: { target: { value: string } }) => onChange({ ...state, kind: e.target.value as EventFilter['kind'] })}>
          <option value="all">Tất cả</option><option value="scheduled">Theo lịch</option><option value="surprise">Bất ngờ</option>
        </select>
      </div>
      <div className="frow" role="group" aria-label="Bậc bằng chứng">
        <span className="flabel">Bằng chứng</span>
        {(['all', 'A', 'B', 'C', 'pending'] as const).map((t) => <button key={t} type="button" className="chip" aria-pressed={state.tier === t} onClick={() => onChange({ ...state, tier: t })}>{TIER_VI[t]}</button>)}
        <button type="button" className="chip" onClick={() => onChange(DEFAULT_EVENT_FILTER)}>Đặt lại</button>
        <span className="muted" data-testid="event-filter-count">{props.shown}/{props.total} sự kiện</span>
      </div>
    </form>
  );
}

const W = 720, H = 120, PAD = 24, MID = 62;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export function EventTimeline(props: { events: EventRow[]; selected: string | null; onSelect: (id: string) => void }) {
  const dated = props.events.filter((e) => e.sessionDate);
  const pending = props.events.length - dated.length;
  const geo = useMemo(() => {
    if (!dated.length) return null;
    const xs = dated.map((e) => dayNum(e.sessionDate as string));
    const lo = Math.min(...xs), hi = Math.max(...xs), span = Math.max(1, hi - lo);
    const x = (d: string) => PAD + ((dayNum(d) - lo) / span) * (W - 2 * PAD);
    const maxCar = Math.max(1, ...dated.map((e) => Math.abs(e.car ?? 0)));
    const y = (e: EventRow) => (e.car === undefined ? MID - 26 : MID - (e.car / maxCar) * 40);
    const years: number[] = [];
    for (let yr = new Date(lo * 86_400_000).getUTCFullYear() + 1; yr <= new Date(hi * 86_400_000).getUTCFullYear(); yr++) years.push(yr);
    return { x, y, years };
  }, [dated]);
  if (!geo) return <p className="state">Không có sự kiện nào đã có phiên phản ứng trong bộ lọc này.</p>;
  return (
    <div className="scroll" data-testid="event-timeline">
      <svg className="ev-tl" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Dòng thời gian ${dated.length} sự kiện thế giới theo phiên phản ứng. Trên đường giữa là ngành mục tiêu tăng, dưới là giảm.`}>
        <line x1={PAD} x2={W - PAD} y1={MID} y2={MID} className="ev-tl-axis" />
        {geo.years.map((yr) => {
          const xx = geo.x(`${yr}-01-01`);
          return <g key={yr}><line x1={xx} x2={xx} y1={14} y2={H - 18} className="ev-tl-tick" /><text x={xx + 3} y={H - 6} className="ev-tl-label">{yr}</text></g>;
        })}
        {dated.map((e) => {
          const cx = geo.x(e.sessionDate as string), cy = geo.y(e);
          const sel = props.selected === e.id;
          const label = `${e.sessionDate}: ${e.titleVi}${e.car !== undefined ? `, phản ứng ${fmtSigned(e.car, 1, '%')}` : ', chưa đo'}, ${TIER_VI[e.tier] ?? e.tier}`;
          return (
            <g key={e.id} role="button" tabIndex={0} aria-label={label} aria-pressed={sel} data-testid={`tl-${e.id}`} className={`ev-tl-pt t-${e.tier}${sel ? ' sel' : ''}`}
              onClick={() => props.onSelect(e.id)} onKeyDown={(k: { key: string; preventDefault(): void }) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); props.onSelect(e.id); } }}>
              <title>{label}</title>
              <line x1={cx} x2={cx} y1={MID} y2={cy} className="ev-tl-stem" />
              <circle cx={cx} cy={cy} r={12} className="ev-tl-hit" />
              <circle cx={cx} cy={cy} r={5} className="ev-tl-dot" />
            </g>
          );
        })}
      </svg>
      <p className="muted">Chấm đặc: bậc A/B. Chấm rỗng: bậc C (chưa đủ bằng chứng). Chiều cao = phản ứng tích luỹ (−1, +3) của ngành mục tiêu.{pending ? ` ${pending} sự kiện chưa có phiên phản ứng không hiện trên trục.` : ''}</p>
    </div>
  );
}
