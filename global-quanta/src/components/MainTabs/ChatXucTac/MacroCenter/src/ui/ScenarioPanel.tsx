import { fmtNum } from '../macro-filter';
import type { ScenarioInfo, ScenarioPayload } from './types';

export function ScenarioPanel(props: {
  scenarios: ScenarioInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  horizon: number;
  onHorizon: (h: number) => void;
  result: ScenarioPayload | null;
  loading: boolean;
  error: string | null;
  targetNames: Record<string, string>;
}) {
  const r = props.result;
  const extent = r ? Math.max(1, ...r.ranking.flatMap((x) => [Math.abs(x.lo), Math.abs(x.hi)])) : 1;
  const pos = (v: number) => 50 + (v / extent) * 48;
  const current = props.scenarios.find((s) => s.id === props.selectedId);
  return (
    <div>
      <div className="sc-list" role="group" aria-label="Chọn kịch bản">
        {props.scenarios.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={props.selectedId === s.id} onClick={() => props.onSelect(s.id)}>{s.nameVi}</button>
        ))}
      </div>
      {current && <p className="muted">{current.descriptionVi}</p>}
      <div className="fb-row">
        <label className="fb-label" htmlFor="mc-h">Tầm nhìn</label>
        <select id="mc-h" value={props.horizon} onChange={(e: { target: { value: string } }) => props.onHorizon(Number(e.target.value))}>
          {[1, 3, 6, 12].map((h) => (<option key={h} value={h}>{h} tháng</option>))}
        </select>
      </div>
      {props.loading && <p className="state" role="status">Đang mô phỏng…</p>}
      {props.error && <p className="state" role="alert">{props.error}</p>}
      {r && !props.loading && (
        <>
          <ul className="sc-rows" aria-label={`Kết quả kịch bản ${r.scenario.nameVi} sau ${r.horizon} tháng`}>
            {r.ranking.map((x) => (
              <li key={x.target} className="sc-row" data-dir={x.est >= 0 ? '+' : '-'} data-sig={String(x.significant)}>
                <span title={props.targetNames[x.target]}>{x.target}</span>
                <div className="sc-bar" aria-hidden="true">
                  <span className="zero" style={{ left: '50%' }} />
                  <span className="ci" style={{ left: `${pos(x.lo)}%`, width: `${Math.max(pos(x.hi) - pos(x.lo), 1)}%` }} />
                  <span className="dot" style={{ left: `${pos(x.est)}%` }} />
                </div>
                <span className="sc-val">{x.est >= 0 ? '+' : ''}{fmtNum(x.est, 1)}%{x.significant ? '' : ' ?'}</span>
              </li>
            ))}
          </ul>
          <p className="muted">Lợi suất cộng dồn ước tính sau {r.horizon} tháng, thanh mờ là khoảng tin cậy 90%. Chấm rỗng và dấu "?" nghĩa là khoảng tin cậy chứa 0: chưa đủ bằng chứng về hướng tác động.</p>
          {r.warnings.map((w) => (<p key={w} className="muted">{w}</p>))}
        </>
      )}
    </div>
  );
}
