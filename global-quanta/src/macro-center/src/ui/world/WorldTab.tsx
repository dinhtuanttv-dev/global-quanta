import { useMemo, useRef, useState } from 'react';
import './world.css';
import { fmtNum, fmtQ } from '../../macro-filter';
import { createWorldClient, type WorldClient } from '../../world-client';
import { DEFAULT_WORLD_FILTER, buildWorldMatrixView, fmtSigned, worldCellKey, type WorldFilter, type WorldMatrixPayload } from '../../world-view';
import { useAsync } from '../useMacro';
import { ConnectednessPanel, type ConnectednessPayload } from './ConnectednessPanel';
import { EventDetail, EventList, type EventDetailPayload, type EventRow } from './EventPanels';
import { WorldScenario } from './ScenarioStock';
import { WorldFilterBar, WorldMatrix } from './WorldMatrix';
import { WorldPulse, type PulseItem } from './WorldPulse';
import { EvidenceChip, Notice, Skeleton } from './shared';
import { Hourglass, Link2, Waves } from 'lucide-react';
import { ScenarioCompare } from './ScenarioCompare';
import { DEFAULT_EVENT_FILTER, EventFilterBar, EventTimeline, filterEvents, isEventFilter } from './EventTimeline';
import { PERSIST_KEYS, usePersistedState } from './persist';
import type { EvidenceTier } from '../../world-types';

/** W4: bộ lọc ma trận đọc lại từ localStorage phải đúng dạng, sai thì dùng mặc định. */
export const isWorldFilter = (v: unknown): v is WorldFilter => !!v && typeof v === 'object'
  && Array.isArray((v as WorldFilter).factors) && Array.isArray((v as WorldFilter).sectors) && Array.isArray((v as WorldFilter).tiers)
  && typeof (v as WorldFilter).channel === 'string' && ['all', '+', '-'].includes((v as WorldFilter).direction);
const isMode = (v: unknown): v is 'single' | 'compare' => v === 'single' || v === 'compare';

export type TabId = 'overview' | 'matrix' | 'events' | 'connect' | 'scenario';

interface SeriesPayload { notice?: string; scenarios: { id: string; nameVi: string; descriptionVi: string }[]; factors: { id: string; channel: string }[] }
interface MatrixPayload extends WorldMatrixPayload { notice?: string; counts: Record<EvidenceTier, number>; warnings: string[]; firstPeriod: string; lastPeriod: string }
interface OverviewPayload { notice?: string; pulse: PulseItem[]; tierCounts: Record<EvidenceTier, number>; spillover: { total: number; fullSample?: number }; events: { total: number; pending: number } }

const CHANNELS: Record<string, string> = { commodity: 'Hàng hoá', fx_rates: 'Tỷ giá, lãi suất', capital_flow: 'Dòng vốn', export_demand: 'Cầu xuất khẩu', risk_sentiment: 'Tâm lý rủi ro', policy_trade: 'Chính sách thương mại' };

const EVENT_PAGE = 10;
/** Mới nhất lên đầu; sự kiện chưa có phiên (đang chờ đo) đứng trước. */
export function newestFirst<T extends { sessionDate: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.sessionDate ?? '9999').localeCompare(a.sessionDate ?? '9999'));
}

/**
 * Một phần của động cơ Kết nối thế giới. Trung tâm kinh tế thế giới xếp từng phần vào khối riêng nên `only` là bắt buộc.
 * Rà soát 20/11/2026: bỏ chế độ toàn trang (tiêu đề, thanh tab trong) và phần hồ sơ phơi nhiễm cổ phiếu —
 * Gateway chưa có dữ liệu phơi nhiễm thật (luôn 422); tra mã dùng khối "Cổ phiếu: tác động và thanh khoản".
 * theme: 'light' | 'dark' | 'auto' (theo hệ điều hành). Nhập './world.css' một lần ở điểm vào ứng dụng.
 */
export function WorldTab(props: { client?: WorldClient; baseUrl?: string; theme?: 'light' | 'dark' | 'auto'; only: TabId }) {
  const client = useMemo(() => props.client ?? createWorldClient(props.baseUrl ?? ''), [props.client, props.baseUrl]);
  const tab = props.only;
  const [filter, setFilter] = usePersistedState<WorldFilter>(PERSIST_KEYS.matrixFilter, DEFAULT_WORLD_FILTER, isWorldFilter);
  const [evFilter, setEvFilter] = usePersistedState(PERSIST_KEYS.eventFilter, DEFAULT_EVENT_FILTER, isEventFilter);
  const [scMode, setScMode] = usePersistedState<'single' | 'compare'>('gq.world.scenario.mode.v1', 'single', isMode);
  const detailRef = useRef<HTMLElement | null>(null);
  const [cell, setCell] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('usd-strong'); // DXY có số liệu thật; TARIFF chưa có nguồn
  const [horizon, setHorizon] = useState(3);
  const [focus, setFocus] = useState<string | null>(null);

  const series = useAsync((s) => client.series<SeriesPayload>(s), [client]);
  const overview = useAsync((s) => client.overview<OverviewPayload>(undefined, s), [client], tab === 'overview');
  const matrix = useAsync((s) => client.matrix<MatrixPayload>({}, s), [client], tab === 'overview' || tab === 'matrix' || tab === 'scenario');
  const conn = useAsync((s) => client.connectedness<ConnectednessPayload>({}, s), [client], tab === 'connect');
  const events = useAsync((s) => client.events<{ events: EventRow[] }>(s), [client], tab === 'events');
  const detail = useAsync((s) => client.event<EventDetailPayload>(eventId as string, s), [client, eventId], tab === 'events' && !!eventId);
  const scenario = useAsync((s) => client.scenario<import('./ScenarioStock').ScenarioPayload>({ scenarioId, horizon }, s), [client, scenarioId, horizon], tab === 'scenario' && scMode === 'single');

  const [eventLimit, setEventLimit] = useState(EVENT_PAGE);
  const allEvents = useMemo(() => newestFirst(events.data?.events ?? []), [events.data]);
  const sortedEvents = useMemo(() => filterEvents(allEvents, evFilter), [allEvents, evFilter]);
  const regions = useMemo(() => [...new Set(allEvents.map((e) => e.region))].sort(), [allEvents]);
  // W4: khi khung chi tiết nằm ngoài màn hình (bố cục một cột — quyết định bởi bề rộng KHUNG, không phải màn hình) -> cuộn tới.
  // Trước đây chỉ xét màn hình ≤ 999px, nên ở 1440 với khung chính ~940px (một cột) chi tiết hiện dưới mép màn hình.
  const pickCell = (f: string, s: string) => {
    setCell(worldCellKey(f, s));
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      const el = detailRef.current, r = el?.getBoundingClientRect?.();
      if (el && r && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  };
  const view = useMemo(() => (matrix.data ? buildWorldMatrixView(matrix.data, filter) : null), [matrix.data, filter]);
  const picked = cell && view ? view.cells[cell] : undefined;
  const notice = overview.data?.notice ?? matrix.data?.notice ?? series.data?.notice;
  const factorName = (id: string) => matrix.data?.factors.find((f) => f.id === id)?.nameVi ?? id;
  const sectorName = (id: string) => matrix.data?.sectors.find((s) => s.id === id)?.nameVi ?? id;

  return (
    <div className="wd" data-theme={props.theme ?? 'auto'}>
      <Notice text={notice} />

      {tab === 'overview' && (
        <section className="panel" aria-labelledby="wd-ov">
          <h2 id="wd-ov">Nhịp đập thế giới</h2>
          {matrix.data?.lastPeriod && <p className="muted">Số liệu tháng {matrix.data.lastPeriod.slice(5, 7)}/{matrix.data.lastPeriod.slice(0, 4)}, so với lịch sử của chính yếu tố đó. Không phải biến động hôm nay.</p>}
          {overview.error && <p className="state alert" role="alert">{overview.error}</p>}
          {!overview.data && !overview.error && <Skeleton kind="cards" rows={8} label="Đang tải tổng quan…" />}
          {overview.data && (
            <>
              <WorldPulse pulse={overview.data.pulse} />
              <ul className="stats">
                {/* G4: thẻ chỉ số có biểu tượng + một dòng ngữ cảnh lấy từ CHÍNH số liệu đã có (không có mũi tên xu hướng: chưa lưu lịch sử chỉ số) */}
                <li><span className="muted kpi-head"><Link2 className="kpi-ic" aria-hidden />Liên kết bậc A</span><strong>{overview.data.tierCounts.A}</strong><span className="kpi-sub">trên {overview.data.tierCounts.A + overview.data.tierCounts.B + overview.data.tierCounts.C} liên kết</span></li>
                <li><span className="muted kpi-head"><Link2 className="kpi-ic" aria-hidden />Liên kết bậc B</span><strong>{overview.data.tierCounts.B}</strong><span className="kpi-sub">có ý nghĩa trong mẫu</span></li>
                <li><span className="muted kpi-head"><Waves className="kpi-ic" aria-hidden />Chỉ số lan truyền tổng</span><strong>{fmtNum(overview.data.spillover.total, 0)}%</strong>{overview.data.spillover.fullSample != null && <span className="kpi-sub">toàn mẫu {fmtNum(overview.data.spillover.fullSample, 0)}%</span>}</li>
                <li><span className="muted kpi-head"><Hourglass className="kpi-ic" aria-hidden />Sự kiện chờ đo</span><strong>{overview.data.events.pending}</strong><span className="kpi-sub">trên {overview.data.events.total} sự kiện</span></li>
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'matrix' && (
        <section className="panel" aria-labelledby="wd-mx">
          <h2 id="wd-mx">Từ thế giới đến ngành Việt Nam</h2>
          {matrix.error && <p className="state alert" role="alert">{matrix.error}</p>}
          {!matrix.data && !matrix.error && <Skeleton kind="grid" rows={10} label="Đang ước lượng ma trận…" />}
          {matrix.data && view && (
            // G3/L12 (19/11/2026): khi chưa có liên kết bậc A/B, ma trận mặc định thu gọn — tóm tắt trước, bức tường ô sọc sau.
            <details className="mx-wrap" open={matrix.data.counts.A + matrix.data.counts.B > 0 || undefined} data-testid="matrix-wrap">
            <summary className="mx-summary" data-testid="matrix-summary">
              {matrix.data.cells.length} liên kết, {matrix.data.counts.A + matrix.data.counts.B} đạt bậc A/B.{matrix.data.counts.A + matrix.data.counts.B === 0 ? ' Bấm để xem các giả thuyết bậc C (thăm dò, không dùng để quyết định).' : ' Bấm để thu gọn.'}
            </summary>
            <div className="two">
              <div>
                <WorldFilterBar state={filter} onChange={(f) => { setFilter(f); setCell(null); }} channels={Object.entries(CHANNELS).map(([id, label]) => ({ id, label }))} />
                <WorldMatrix view={view} selected={cell} onSelect={pickCell} />
                <details><summary>Lưu ý phương pháp ({matrix.data.warnings.length})</summary><ul>{matrix.data.warnings.map((w) => (<li key={w} className="muted">{w}</li>))}</ul></details>
              </div>
              <aside aria-label="Chi tiết liên kết đã chọn" className="detail" ref={detailRef} data-testid="matrix-detail">
                {picked ? (
                  <>
                    <h3 className="h3">{factorName(picked.factor)} → {sectorName(picked.sector)}</h3>
                    <EvidenceChip tier={picked.tier} />
                    <p>{picked.reasonVi}</p>
                    <dl className="kv">
                      <dt>Hướng</dt><dd>{picked.direction === '+' ? 'Tăng giá' : 'Giảm giá'}</dd>
                      <dt>Hệ số</dt><dd>{fmtSigned(picked.beta, 2)}</dd>
                      <dt>Thống kê t</dt><dd>{fmtNum(picked.t, 1)}</dd>
                      <dt>q sau hiệu chỉnh</dt><dd>{fmtQ(picked.q)}</dd>
                      <dt>Độ trễ</dt><dd>{picked.lag} tháng</dd>
                    </dl>
                    <p className="muted">Quan hệ thống kê lịch sử, không chứng minh nhân quả.</p>
                  </>
                ) : (<p className="state">Chọn một ô để xem bằng chứng và độ ổn định.</p>)}
              </aside>
            </div>
            </details>
          )}
        </section>
      )}

      {tab === 'events' && (
        <section className="panel" aria-labelledby="wd-ev">
          <h2 id="wd-ev">Sự kiện và phản ứng{events.data && <span className="ev-count" data-testid="events-count">{allEvents.length} sự kiện · {allEvents.filter((e) => e.tier === 'pending').length} chờ đo</span>}</h2>
          {events.error && <p className="state alert" role="alert">{events.error}</p>}
          {!events.data && !events.error && <Skeleton kind="table" rows={8} label="Đang đo phản ứng của các sự kiện…" />}
          {events.data && (
            <div className="two">
              <div>
                <EventFilterBar state={evFilter} onChange={(f) => { setEvFilter(f); setEventLimit(EVENT_PAGE); }} regions={regions} shown={sortedEvents.length} total={allEvents.length} />
                <EventTimeline events={sortedEvents} selected={eventId} onSelect={setEventId} />
                <EventList events={sortedEvents.slice(0, eventLimit)} selected={eventId} onSelect={setEventId} />
                {sortedEvents.length > eventLimit && <button type="button" className="btn" onClick={() => setEventLimit((n) => n + EVENT_PAGE)} data-testid="events-more">Xem thêm {Math.min(EVENT_PAGE, sortedEvents.length - eventLimit)} sự kiện (còn {sortedEvents.length - eventLimit})</button>}
              </div>
              <aside aria-label="Chi tiết sự kiện đã chọn">
                {detail.error && <p className="state alert" role="alert">{detail.error}</p>}
                {eventId && detail.data ? <EventDetail d={detail.data} /> : <p className="state">{eventId && detail.loading ? 'Đang tải…' : 'Chọn một sự kiện để xem đường lợi suất bất thường.'}</p>}
              </aside>
            </div>
          )}
        </section>
      )}

      {tab === 'connect' && (
        <section className="panel" aria-labelledby="wd-cn">
          <h2 id="wd-cn">Kết nối thị trường</h2>
          {conn.error && <p className="state alert" role="alert">{conn.error}</p>}
          {!conn.data && !conn.error && <Skeleton kind="chart" label="Đang tính mức lan truyền…" />}
          {conn.data && <ConnectednessPanel data={conn.data} />}
        </section>
      )}

      {tab === 'scenario' && (
        <section className="panel" aria-labelledby="wd-sc">
          <h2 id="wd-sc">Kịch bản</h2>
          <div className="chips sc-mode" role="group" aria-label="Cách xem kịch bản">
            <button type="button" className="chip" aria-pressed={scMode === 'single'} onClick={() => setScMode('single')} data-testid="sc-mode-single">Một kịch bản</button>
            <button type="button" className="chip" aria-pressed={scMode === 'compare'} onClick={() => setScMode('compare')} data-testid="sc-mode-compare">So sánh kịch bản</button>
          </div>
          {scMode === 'compare' ? (
            <ScenarioCompare client={client} scenarios={series.data?.scenarios ?? []} horizon={horizon} onHorizon={setHorizon} onPick={(id, sector) => { setScenarioId(id); setFocus(sector); setScMode('single'); }} />
          ) : (
          <WorldScenario
            scenarios={series.data?.scenarios ?? []} selectedId={scenarioId} onSelect={setScenarioId} horizon={horizon} onHorizon={setHorizon}
            result={scenario.data} loading={scenario.loading && !scenario.data} error={scenario.error} focusSector={focus} onFocus={setFocus}
          />
          )}
        </section>
      )}

    </div>
  );
}
