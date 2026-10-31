import { useMemo, useState } from 'react';
import './world.css';
import { fmtNum, fmtQ } from '../../macro-filter';
import { createWorldClient, type WorldClient } from '../../world-client';
import { DEFAULT_WORLD_FILTER, buildWorldMatrixView, fmtSigned, worldCellKey, type WorldFilter, type WorldMatrixPayload } from '../../world-view';
import { useAsync } from '../useMacro';
import { ConnectednessPanel, type ConnectednessPayload } from './ConnectednessPanel';
import { EventDetail, EventList, type EventDetailPayload, type EventRow } from './EventPanels';
import { ScenarioStockImports } from './imports';
import { WorldFilterBar, WorldMatrix } from './WorldMatrix';
import { WorldPulse, type PulseItem } from './WorldPulse';
import { EvidenceChip, Notice } from './shared';
import type { EvidenceTier } from '../../world-types';

const { WorldScenario, StockProfile } = ScenarioStockImports;

export type TabId = 'overview' | 'matrix' | 'events' | 'connect' | 'scenario' | 'stock';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' }, { id: 'matrix', label: 'Ngành (thăm dò)' }, { id: 'events', label: 'Sự kiện' },
  { id: 'connect', label: 'Kết nối thị trường' }, { id: 'scenario', label: 'Kịch bản' }, { id: 'stock', label: 'Hồ sơ cổ phiếu' },
];

interface SeriesPayload { notice?: string; scenarios: { id: string; nameVi: string; descriptionVi: string }[]; factors: { id: string; channel: string }[] }
interface MatrixPayload extends WorldMatrixPayload { notice?: string; counts: Record<EvidenceTier, number>; warnings: string[]; firstPeriod: string; lastPeriod: string }
interface OverviewPayload { notice?: string; pulse: PulseItem[]; tierCounts: Record<EvidenceTier, number>; spillover: { total: number }; events: { total: number; pending: number } }

const CHANNELS: Record<string, string> = { commodity: 'Hàng hoá', fx_rates: 'Tỷ giá, lãi suất', capital_flow: 'Dòng vốn', export_demand: 'Cầu xuất khẩu', risk_sentiment: 'Tâm lý rủi ro', policy_trade: 'Chính sách thương mại' };

const EVENT_PAGE = 10;
/** Mới nhất lên đầu; sự kiện chưa có phiên (đang chờ đo) đứng trước. */
export function newestFirst<T extends { sessionDate: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.sessionDate ?? '9999').localeCompare(a.sessionDate ?? '9999'));
}

/** Import './world.css' once in your app entry. theme: 'light' | 'dark' | 'auto' (follows the OS). */
/** hideHeader: ẩn tiêu đề khi nhúng trong một tab đã có tiêu đề riêng (Global Quanta). hideStock: ẩn hồ sơ cổ phiếu khi chưa có dữ liệu phơi nhiễm thật. */
/** only: chỉ hiện đúng một phần, bỏ thanh tab trong (Trung tâm kinh tế thế giới xếp từng phần vào tab con riêng). */
export function WorldTab(props: { client?: WorldClient; baseUrl?: string; theme?: 'light' | 'dark' | 'auto'; initialStock?: string; hideHeader?: boolean; hideStock?: boolean; only?: TabId }) {
  const client = useMemo(() => props.client ?? createWorldClient(props.baseUrl ?? ''), [props.client, props.baseUrl]);
  const [tab, setTab] = useState<TabId>(props.only ?? 'overview');
  const [filter, setFilter] = useState<WorldFilter>(DEFAULT_WORLD_FILTER);
  const [cell, setCell] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('usd-strong'); // DXY có số liệu thật; TARIFF chưa có nguồn
  const [horizon, setHorizon] = useState(3);
  const [focus, setFocus] = useState<string | null>(null);
  const [stockCode, setStockCode] = useState(props.initialStock ?? 'SEA1');

  const series = useAsync((s) => client.series<SeriesPayload>(s), [client]);
  const overview = useAsync((s) => client.overview<OverviewPayload>(undefined, s), [client], tab === 'overview');
  const matrix = useAsync((s) => client.matrix<MatrixPayload>({}, s), [client], tab === 'overview' || tab === 'matrix' || tab === 'scenario' || tab === 'stock');
  const conn = useAsync((s) => client.connectedness<ConnectednessPayload>({}, s), [client], tab === 'connect');
  const events = useAsync((s) => client.events<{ events: EventRow[] }>(s), [client], tab === 'events');
  const detail = useAsync((s) => client.event<EventDetailPayload>(eventId as string, s), [client, eventId], tab === 'events' && !!eventId);
  const scenario = useAsync((s) => client.scenario<import('./ScenarioStock').ScenarioPayload>({ scenarioId, horizon }, s), [client, scenarioId, horizon], tab === 'scenario');
  const stock = useAsync((s) => client.stock<import('./ScenarioStock').StockProfilePayload>(stockCode, s), [client, stockCode], tab === 'stock');

  const [eventLimit, setEventLimit] = useState(EVENT_PAGE);
  const sortedEvents = useMemo(() => newestFirst(events.data?.events ?? []), [events.data]);
  const view = useMemo(() => (matrix.data ? buildWorldMatrixView(matrix.data, filter) : null), [matrix.data, filter]);
  const picked = cell && view ? view.cells[cell] : undefined;
  const notice = overview.data?.notice ?? matrix.data?.notice ?? series.data?.notice;
  const factorName = (id: string) => matrix.data?.factors.find((f) => f.id === id)?.nameVi ?? id;
  const sectorName = (id: string) => matrix.data?.sectors.find((s) => s.id === id)?.nameVi ?? id;

  return (
    <div className="wd" data-theme={props.theme ?? 'auto'}>
      {!props.hideHeader && (
      <header>
          <p className="muted">Trung tâm vĩ mô</p>
          <h1>Kết nối thế giới</h1>
          <p className="muted">Yếu tố và sự kiện của thế giới đi vào ngành và cổ phiếu Việt Nam qua những kênh nào, và bằng chứng cho từng mắt xích mạnh đến đâu.</p>
        </header>
      )}
      <Notice text={notice} />
      {!props.only && <nav className="tabs" aria-label="Các phần của Kết nối thế giới">
        {TABS.filter((t) => !(props.hideStock && t.id === 'stock')).map((t) => (<button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>))}
      </nav>}

      {tab === 'overview' && (
        <section className="panel" aria-labelledby="wd-ov">
          <h2 id="wd-ov">Nhịp đập thế giới</h2>
          {matrix.data?.lastPeriod && <p className="muted">Số liệu tháng {matrix.data.lastPeriod.slice(5, 7)}/{matrix.data.lastPeriod.slice(0, 4)}, so với lịch sử của chính yếu tố đó. Không phải biến động hôm nay.</p>}
          {overview.error && <p className="state alert" role="alert">{overview.error}</p>}
          {!overview.data && !overview.error && <p className="state" role="status">Đang tải tổng quan…</p>}
          {overview.data && (
            <>
              <WorldPulse pulse={overview.data.pulse} />
              <ul className="stats">
                <li><span className="muted">Liên kết bậc A</span><strong>{overview.data.tierCounts.A}</strong></li>
                <li><span className="muted">Liên kết bậc B</span><strong>{overview.data.tierCounts.B}</strong></li>
                <li><span className="muted">Chỉ số lan truyền tổng</span><strong>{fmtNum(overview.data.spillover.total, 0)}%</strong></li>
                <li><span className="muted">Sự kiện chờ đo</span><strong>{overview.data.events.pending}</strong></li>
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'matrix' && (
        <section className="panel" aria-labelledby="wd-mx">
          <h2 id="wd-mx">Từ thế giới đến ngành Việt Nam</h2>
          {matrix.error && <p className="state alert" role="alert">{matrix.error}</p>}
          {!matrix.data && !matrix.error && <p className="state" role="status">Đang ước lượng ma trận…</p>}
          {matrix.data && view && (
            <div className="two">
              <div>
                <WorldFilterBar state={filter} onChange={(f) => { setFilter(f); setCell(null); }} channels={Object.entries(CHANNELS).map(([id, label]) => ({ id, label }))} />
                <WorldMatrix view={view} selected={cell} onSelect={(f, s) => setCell(worldCellKey(f, s))} />
                <details><summary>Lưu ý phương pháp ({matrix.data.warnings.length})</summary><ul>{matrix.data.warnings.map((w) => (<li key={w} className="muted">{w}</li>))}</ul></details>
              </div>
              <aside aria-label="Chi tiết liên kết đã chọn" className="detail">
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
          )}
        </section>
      )}

      {tab === 'events' && (
        <section className="panel" aria-labelledby="wd-ev">
          <h2 id="wd-ev">Sự kiện và phản ứng</h2>
          {events.error && <p className="state alert" role="alert">{events.error}</p>}
          {!events.data && !events.error && <p className="state" role="status">Đang đo phản ứng của các sự kiện…</p>}
          {events.data && (
            <div className="two">
              <div>
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
          {!conn.data && !conn.error && <p className="state" role="status">Đang tính mức lan truyền…</p>}
          {conn.data && <ConnectednessPanel data={conn.data} />}
        </section>
      )}

      {tab === 'scenario' && (
        <section className="panel" aria-labelledby="wd-sc">
          <h2 id="wd-sc">Kịch bản</h2>
          <WorldScenario
            scenarios={series.data?.scenarios ?? []} selectedId={scenarioId} onSelect={setScenarioId} horizon={horizon} onHorizon={setHorizon}
            result={scenario.data} loading={scenario.loading && !scenario.data} error={scenario.error} focusSector={focus} onFocus={setFocus}
          />
        </section>
      )}

      {tab === 'stock' && (
        <section className="panel" aria-labelledby="wd-st">
          <h2 id="wd-st">Hồ sơ phơi nhiễm quốc tế</h2>
          <div className="frow">
            <label className="flabel" htmlFor="wd-code">Mã cổ phiếu</label>
            <input id="wd-code" className="input" value={stockCode} onChange={(e: { target: { value: string } }) => setStockCode(e.target.value.trim().toUpperCase())} />
          </div>
          {stock.error && <p className="state alert" role="alert">{stock.error}</p>}
          {stock.data ? <StockProfile d={stock.data} /> : !stock.error && <p className="state" role="status">Đang tải hồ sơ…</p>}
        </section>
      )}
    </div>
  );
}
