import { useMemo, useState } from 'react';
import './macro-center.css';
import { DEFAULT_FILTER, buildMatrixView, cellKey, describeCell, type FilterState } from '../macro-filter';
import { createMacroClient, type MacroClient } from '../macro-client';
import { useAsync } from './useMacro';
import { MacroThermometer } from './MacroThermometer';
import { MacroFilterBar } from './MacroFilterBar';
import { MacroImpactMatrix } from './MacroImpactMatrix';
import { CellDetail } from './CellDetail';
import { ScenarioPanel } from './ScenarioPanel';
import { MacroCalendar } from './MacroCalendar';
import type { AlertsPayload, CalendarPayload, CellDetailPayload, HealthPayload, ImpactPayload, ScenarioPayload, SeriesPayload, ThermoPayload } from './types';

export function MacroCenterTab(props: { client?: MacroClient; baseUrl?: string; asOf?: string; mainTarget?: string }) {
  const client = useMemo(() => props.client ?? createMacroClient(props.baseUrl ?? ''), [props.client, props.baseUrl]);
  const asOf = props.asOf;
  const mainTarget = props.mainTarget ?? 'VNINDEX';

  const [maxLag] = useState(6);
  const [alpha] = useState(0.05);
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [selected, setSelected] = useState<{ factor: string; target: string } | null>(null);
  const [scenarioId, setScenarioId] = useState('easing');
  const [horizon, setHorizon] = useState(3);
  const [healthRetry, setHealthRetry] = useState(0);

  const health = useAsync((s) => client.health<HealthPayload>(s), [client, healthRetry]);
  const connected = health.data?.ok === true;
  const series = useAsync((s) => client.series<SeriesPayload>(asOf, s), [client, asOf], connected);
  const impact = useAsync((s) => client.impact<ImpactPayload>({ asOf, maxLag, alpha }, s), [client, asOf, maxLag, alpha], connected);
  const score = useAsync((s) => client.score<ThermoPayload>({ asOf, target: mainTarget }, s), [client, asOf, mainTarget], connected);
  const alerts = useAsync((s) => client.alerts<AlertsPayload>(asOf, s), [client, asOf], connected);
  const calendar = useAsync((s) => client.calendar<CalendarPayload>(asOf, s), [client, asOf], connected);

  const view = useMemo(() => (impact.data ? buildMatrixView(impact.data, filter) : null), [impact.data, filter]);
  const selectedCell = selected && view ? view.cells[cellKey(selected.factor, selected.target)] : undefined;
  const detail = useAsync(
    (s) =>
      client.cell<CellDetailPayload>({ asOf, factor: selected!.factor, target: selected!.target, lag: selectedCell?.lag ?? 1, arLags: selectedCell?.arLags ?? 1 }, s),
    [client, asOf, selected?.factor, selected?.target, selectedCell?.lag],
    connected && !!selected && !!selectedCell,
  );
  const scenario = useAsync((s) => client.scenario<ScenarioPayload>({ asOf, scenarioId, horizon }, s), [client, asOf, scenarioId, horizon], connected);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    series.data?.series.forEach((x) => (m[x.id] = x.nameVi));
    return m;
  }, [series.data]);
  const toOpts = (ids: string[]) => ids.map((id) => ({ id, label: names[id] ?? id }));
  const notice = impact.data?.notice ?? score.data?.notice ?? series.data?.notice;
  const transformOf = (id: string) => impact.data?.diagnostics.find((d) => d.id === id)?.transform ?? 'level';

  return (
    <div className="mc">
      <header>
        <h1>Trung tâm vĩ mô</h1>
        <p className="muted">Tác động của biến vĩ mô lên các chỉ số cổ phiếu HOSE. Mọi chuỗi đã kiểm tra tính dừng, sai số chuẩn HAC, kiểm định bội đã hiệu chỉnh.</p>
      </header>
      {notice && <p className="mc-notice" role="note">{notice}</p>}
      {!health.data && !health.error && <p className="state" role="status">Đang kết nối dịch vụ Macro…</p>}
      {(health.error || (health.data && !health.data.ok)) && (
        <div className="mc-section" role="alert">
          <h2>Chưa kết nối được dịch vụ Macro</h2>
          <p>{health.error ?? 'Macro API không xác nhận trạng thái sẵn sàng.'}</p>
          <p className="muted">Các phân tích cần API và dữ liệu nguồn thật. Tab này không thay thế dữ liệu còn thiếu bằng dữ liệu mô phỏng.</p>
          <button type="button" className="btn" onClick={() => setHealthRetry((attempt) => attempt + 1)}>Thử kết nối lại</button>
        </div>
      )}

      {connected && <>
      <section className="mc-section" aria-labelledby="mc-thermo">
        <h2 id="mc-thermo">Nhiệt kế vĩ mô</h2>
        {score.error ? <p className="state" role="alert">{score.error}</p> : score.data ? <MacroThermometer data={score.data} names={names} /> : <p className="state" role="status">Đang tính nhiệt kế vĩ mô…</p>}
      </section>

      <section className="mc-section" aria-labelledby="mc-matrix">
        <h2 id="mc-matrix">Ma trận tác động</h2>
        {impact.error && <p className="state" role="alert">{impact.error}</p>}
        {!impact.data && !impact.error && <p className="state" role="status">Đang ước lượng ma trận tác động…</p>}
        {impact.data && view && (
          <div className="mc-grid two">
            <div className="mc-grid">
              <MacroFilterBar state={filter} onChange={(f) => { setFilter(f); setSelected(null); }} factors={toOpts(impact.data.factors)} targets={toOpts(impact.data.targets)} maxLag={impact.data.options.maxLag} />
              <MacroImpactMatrix view={view} factorNames={names} targetNames={names} selected={selected ? cellKey(selected.factor, selected.target) : null} onSelect={(factor, target) => setSelected({ factor, target })} />
              <details>
                <summary>Lưu ý phương pháp ({impact.data.warnings.length})</summary>
                <ul>{impact.data.warnings.map((w) => (<li key={w} className="muted">{w}</li>))}</ul>
              </details>
            </div>
            <aside aria-label="Chi tiết ô đã chọn">
              <CellDetail
                detail={detail.data} loading={detail.loading && !!selected} error={detail.error} onClose={() => setSelected(null)}
                sentence={selectedCell && selected ? describeCell(selectedCell, { factor: names[selected.factor] ?? selected.factor, target: names[selected.target] ?? selected.target }, transformOf(selected.factor)) : ''}
              />
            </aside>
          </div>
        )}
      </section>

      <div className="mc-grid two">
        <section className="mc-section" aria-labelledby="mc-scn">
          <h2 id="mc-scn">Kịch bản</h2>
          {series.error && <p className="state" role="alert">{series.error}</p>}
          <ScenarioPanel
            scenarios={series.data?.scenarios ?? []} selectedId={scenarioId} onSelect={setScenarioId} horizon={horizon} onHorizon={setHorizon}
            result={scenario.data} loading={scenario.loading && !scenario.data} error={scenario.error} targetNames={names}
          />
        </section>
        <section className="mc-section" aria-labelledby="mc-cal">
          <MacroCalendar calendar={calendar.data} alerts={alerts.data} calendarError={calendar.error} alertsError={alerts.error} />
        </section>
      </div>
      </>}
    </div>
  );
}
