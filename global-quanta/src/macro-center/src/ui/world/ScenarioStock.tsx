import { fmtNum } from '../../macro-filter';
import { fmtSigned } from '../../world-view';
import { CiTrack, ColumnChart, EvidenceChip, HorizonPills, Skeleton } from './shared';
import type { EvidenceTier } from '../../world-types';

export interface ScenarioPayload {
  scenario: { id: string; nameVi: string; descriptionVi: string };
  horizon: number;
  sectors: { sector: string; nameVi: string; irf: { h: number; est: number; lo: number; hi: number }[]; est: number; lo: number; hi: number; conclusive: boolean; unstable?: boolean }[];
  stocks: { code: string; sectorName: string; beta: number; ownWeight: number; est: number; tier: EvidenceTier }[];
  stockFactor: string | null;
  conclusiveCount: number;
  warnings: string[];
}

export interface ScenarioInfo { id: string; nameVi: string; descriptionVi: string }

export function WorldScenario(props: {
  scenarios: ScenarioInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  horizon: number;
  onHorizon: (h: number) => void;
  result: ScenarioPayload | null;
  loading: boolean;
  error: string | null;
  focusSector: string | null;
  onFocus: (sector: string) => void;
}) {
  const r = props.result;
  const cur = props.scenarios.find((s) => s.id === props.selectedId);
  // W5: ngành bất ổn (vượt ±50% trong 3 tháng) không được kéo giãn thang của các ngành còn lại
  const range = r ? Math.max(5, ...r.sectors.filter((s) => !s.unstable).flatMap((s) => [Math.abs(s.lo), Math.abs(s.hi)])) : 5;
  const focus = r?.sectors.find((s) => s.sector === props.focusSector) ?? r?.sectors[0];
  return (
    <div>
      <div className="chips" role="group" aria-label="Chọn kịch bản">
        {props.scenarios.map((s) => (<button key={s.id} type="button" className="chip" aria-pressed={props.selectedId === s.id} onClick={() => props.onSelect(s.id)}>{s.nameVi}</button>))}
      </div>
      {cur && <p className="muted">{cur.descriptionVi}</p>}
      <HorizonPills value={props.horizon} onChange={props.onHorizon} idPrefix="wd-h" />
      {props.loading && <Skeleton kind="table" rows={10} label="Đang mô phỏng…" />}
      {props.error && <p className="state alert" role="alert">{props.error}</p>}
      {r && !props.loading && (
        <>
          <p className="muted">{r.conclusiveCount} / {r.sectors.length} ngành kết luận được hướng. Chấm rỗng: khoảng tin cậy 90% chứa 0, chưa kết luận được hướng.</p>
          <ul className="sector-bars wide" aria-label={`Kết quả kịch bản ${r.scenario.nameVi} sau ${r.horizon} tháng`}>
            {r.sectors.map((s) => (
              <li key={s.sector} className={focus?.sector === s.sector ? 'sel' : undefined}>
                <button type="button" className="link" onClick={() => props.onFocus(s.sector)} aria-pressed={focus?.sector === s.sector}>{s.nameVi}</button>
                {s.unstable ? <span className="muted" data-testid={`sc-unstable-${s.sector}`}>bất ổn về số — không dùng</span> : <CiTrack est={s.est} lo={s.lo} hi={s.hi} range={range} label={`${s.nameVi}: ${fmtSigned(s.est, 1, '%')}${s.conclusive ? '' : ', chưa kết luận hướng'}`} />}
                <strong>{s.unstable ? 'bất ổn' : <>{fmtSigned(s.est, 1, '%')}{s.conclusive ? '' : ' ?'}</>}</strong>
              </li>
            ))}
          </ul>
          {focus && (
            <>
              <h3 className="h3">Đường đáp ứng theo tháng, ngành {focus.nameVi}</h3>
              <ColumnChart values={focus.irf.map((p) => p.est)} scale={60 / range} half={80} ci={focus.irf.map((p) => ({ lo: p.lo, hi: p.hi }))} highlight={(i) => i === r.horizon} label={`Đường đáp ứng của ngành ${focus.nameVi} từ tháng 0 đến tháng ${focus.irf.length - 1}`}
                xLabel={(i) => `T${focus.irf[i]?.h ?? i}`} tableCaption={`Đường đáp ứng ngành ${focus.nameVi} theo tháng (%), kèm khoảng tin cậy 90%`} />
              <p className="muted">Lợi suất cộng dồn sau mỗi tháng; thanh dọc là khoảng tin cậy; nền đậm là tầm nhìn đã chọn.</p>
            </>
          )}
          {r.stocks.length > 0 && (
            <>
              <h3 className="h3">Cổ phiếu chịu tác động mạnh nhất</h3>
              <div className="scroll">
                <table className="stock-table">
                  <thead><tr><th scope="col">Mã</th><th scope="col">Ngành</th><th scope="col">Độ nhạy sau co rút</th><th scope="col">Ước tính</th><th scope="col">Bậc</th></tr></thead>
                  <tbody>
                    {r.stocks.map((s) => (
                      <tr key={s.code}><th scope="row">{s.code}</th><td>{s.sectorName}</td><td>{fmtSigned(s.beta, 2)}<br /><span className="muted">dữ liệu riêng {fmtNum(s.ownWeight * 100, 0)}%</span></td><td><strong>{fmtSigned(s.est, 1, '%')}</strong></td><td><EvidenceChip tier={s.tier} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">Bậc của mã không bao giờ cao hơn bậc của ngành.</p>
            </>
          )}
          {r.warnings.map((w) => (<p key={w} className="muted">{w}</p>))}
        </>
      )}
    </div>
  );
}
