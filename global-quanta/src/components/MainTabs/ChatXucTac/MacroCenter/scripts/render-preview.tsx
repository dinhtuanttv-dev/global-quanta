import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readFileSync } from 'node:fs';
import { MacroThermometer } from '../src/ui/MacroThermometer';
import { MacroFilterBar } from '../src/ui/MacroFilterBar';
import { MacroImpactMatrix } from '../src/ui/MacroImpactMatrix';
import { CellDetail } from '../src/ui/CellDetail';
import { ScenarioPanel } from '../src/ui/ScenarioPanel';
import { MacroCalendar } from '../src/ui/MacroCalendar';
import { DEFAULT_FILTER, buildMatrixView, describeCell } from '../src/macro-filter';
import { createMacroApi } from '../src/macro-api';
import { makeSyntheticStore, SYNTHETIC_NOTICE } from '../src/macro-seed';
type Any = any; // eslint-disable-line
(async () => {
  const api = createMacroApi({ store: makeSyntheticStore(2024), today: () => '2026-07-15' });
  const call = async (path: string, body: unknown, method = 'POST') => (await api.handle({ method, path, query: {}, body })).body as Any;
  const series = await call('/api/macro/series', undefined, 'GET');
  const names: Record<string, string> = {};
  series.series.forEach((s: Any) => (names[s.id] = s.nameVi));
  const impact = await call('/api/macro/impact', {});
  const score = await call('/api/macro/score', {});
  const detail = await call('/api/macro/cell', { factor: 'CPI', target: 'VNSMALLCAP', lag: 1, arLags: 1 });
  const scn = await call('/api/macro/scenario', { scenarioId: 'easing', horizon: 3 });
  const cal = await call('/api/macro/calendar', undefined, 'GET');
  const alerts = await call('/api/macro/alerts', undefined, 'GET');
  const filter = { ...DEFAULT_FILTER, factors: ['CPI', 'IR', 'M2', 'DXY', 'PMI', 'EX', 'FDI', 'OIL'] };
  const view = buildMatrixView(impact, filter);
  const sel = view.cells['CPI|VNSMALLCAP'];
  const sentence = describeCell(sel, { factor: names.CPI, target: names.VNSMALLCAP }, 'diff');
  const noop = () => undefined;
  const body = renderToStaticMarkup(
    <div className="mc">
      <header><h1>Trung tâm vĩ mô</h1><p className="muted">Tác động của biến vĩ mô lên các chỉ số cổ phiếu HOSE. Mọi chuỗi đã kiểm tra tính dừng, sai số chuẩn HAC, kiểm định bội đã hiệu chỉnh.</p></header>
      <p className="mc-notice" role="note">{SYNTHETIC_NOTICE}</p>
      <section className="mc-section"><h2>Nhiệt kế vĩ mô</h2><MacroThermometer data={score} names={names} /></section>
      <section className="mc-section"><h2>Ma trận tác động</h2>
        <div className="mc-grid two">
          <div className="mc-grid">
            <MacroFilterBar state={filter} onChange={noop} factors={impact.factors.map((id: string) => ({ id, label: names[id] }))} targets={impact.targets.map((id: string) => ({ id, label: names[id] }))} maxLag={6} />
            <MacroImpactMatrix view={view} factorNames={names} targetNames={names} selected="CPI|VNSMALLCAP" onSelect={noop} />
          </div>
          <aside><CellDetail detail={detail} loading={false} error={null} sentence={sentence} onClose={noop} /></aside>
        </div>
      </section>
      <div className="mc-grid two">
        <section className="mc-section"><h2>Kịch bản</h2><ScenarioPanel scenarios={series.scenarios} selectedId="easing" onSelect={noop} horizon={3} onHorizon={noop} result={scn} loading={false} error={null} targetNames={names} /></section>
        <section className="mc-section"><MacroCalendar calendar={cal} alerts={alerts} /></section>
      </div>
    </div>,
  );
  const css = readFileSync('src/ui/macro-center.css', 'utf8').split('\n').filter((l: string) => !l.startsWith('@import')).join('\n');
  writeFileSync('/tmp/preview.html', `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#e8ecf0}${css}</style><body>${body}</body></html>`);
  console.log('preview written', body.length);
})();
