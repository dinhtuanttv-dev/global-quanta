import { fmtNum } from '../../macro-filter';
import { fmtSigned } from '../../world-view';
import { CiTrack, ColumnChart, EvidenceChip } from './shared';
import type { EvidenceTier } from '../../world-types';

export interface ScenarioPayload {
  scenario: { id: string; nameVi: string; descriptionVi: string };
  horizon: number;
  sectors: { sector: string; nameVi: string; irf: { h: number; est: number; lo: number; hi: number }[]; est: number; lo: number; hi: number; conclusive: boolean }[];
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
  const range = r ? Math.max(5, ...r.sectors.flatMap((s) => [Math.abs(s.lo), Math.abs(s.hi)])) : 5;
  const focus = r?.sectors.find((s) => s.sector === props.focusSector) ?? r?.sectors[0];
  return (
    <div>
      <div className="chips" role="group" aria-label="Chọn kịch bản">
        {props.scenarios.map((s) => (<button key={s.id} type="button" className="chip" aria-pressed={props.selectedId === s.id} onClick={() => props.onSelect(s.id)}>{s.nameVi}</button>))}
      </div>
      {cur && <p className="muted">{cur.descriptionVi}</p>}
      <div className="frow">
        <label className="flabel" htmlFor="wd-h">Tầm nhìn</label>
        <select id="wd-h" value={props.horizon} onChange={(e: { target: { value: string } }) => props.onHorizon(Number(e.target.value))}>
          {[1, 3, 6, 12].map((h) => (<option key={h} value={h}>{h} tháng</option>))}
        </select>
      </div>
      {props.loading && <p className="state" role="status">Đang mô phỏng…</p>}
      {props.error && <p className="state alert" role="alert">{props.error}</p>}
      {r && !props.loading && (
        <>
          <p className="muted">{r.conclusiveCount} / {r.sectors.length} ngành kết luận được hướng. Chấm rỗng: khoảng tin cậy 90% chứa 0, chưa kết luận được hướng.</p>
          <ul className="sector-bars wide" aria-label={`Kết quả kịch bản ${r.scenario.nameVi} sau ${r.horizon} tháng`}>
            {r.sectors.map((s) => (
              <li key={s.sector} className={focus?.sector === s.sector ? 'sel' : undefined}>
                <button type="button" className="link" onClick={() => props.onFocus(s.sector)} aria-pressed={focus?.sector === s.sector}>{s.nameVi}</button>
                <CiTrack est={s.est} lo={s.lo} hi={s.hi} range={range} label={`${s.nameVi}: ${fmtSigned(s.est, 1, '%')}${s.conclusive ? '' : ', chưa kết luận hướng'}`} />
                <strong>{fmtSigned(s.est, 1, '%')}{s.conclusive ? '' : ' ?'}</strong>
              </li>
            ))}
          </ul>
          {focus && (
            <>
              <h3 className="h3">Đường đáp ứng theo tháng, ngành {focus.nameVi}</h3>
              <ColumnChart values={focus.irf.map((p) => p.est)} scale={60 / range} half={80} ci={focus.irf.map((p) => ({ lo: p.lo, hi: p.hi }))} highlight={(i) => i === r.horizon} label={`Đường đáp ứng của ngành ${focus.nameVi} từ tháng 0 đến tháng ${focus.irf.length - 1}`} />
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

export interface StockProfilePayload {
  code: string;
  sectorName: string;
  exposure: { revenueByRegion: Record<string, number>; commodityCostShare: number; fxRevenueShare: number; fxDebtShare: number; asOfPeriod: string; sourceRef: string };
  betas: { factor: string; nameVi: string; own: number; se: number; sectorPrior: number; shrunk: number; ownWeight: number; tier: EvidenceTier; sectorPeers: number }[];
}

const REGION_VI: Record<string, string> = { VN: 'Việt Nam', US: 'Mỹ', EU: 'Châu Âu', CN: 'Trung Quốc', JP: 'Nhật', KR: 'Hàn Quốc', TH: 'Thái Lan', GLOBAL: 'Khác' };

export function StockProfile({ d }: { d: StockProfilePayload }) {
  const rev = Object.entries(d.exposure.revenueByRegion).sort((a, b) => b[1] - a[1]);
  const pos = (v: number) => Math.min(98, Math.max(2, 50 + (v / 5) * 48));
  return (
    <div className="stock">
      <h3 className="h3">Doanh thu theo vùng</h3>
      <div className="rev-bar" role="img" aria-label={`Doanh thu theo vùng: ${rev.map(([r, v]) => `${REGION_VI[r] ?? r} ${v}%`).join(', ')}`}>
        {rev.map(([r, v], i) => (<span key={r} className={`rev r${Math.min(i, 4)}`} style={{ width: `${v}%` }} />))}
      </div>
      <ul className="rev-legend">{rev.map(([r, v], i) => (<li key={r}><i className={`sw r${Math.min(i, 4)}`} />{REGION_VI[r] ?? r}<strong>{v}%</strong></li>))}</ul>
      <p className="muted">Nguồn: {d.exposure.sourceRef}, kỳ {d.exposure.asOfPeriod}. Đây là dữ kiện báo cáo, không phải ước lượng thống kê.</p>
      <p>Doanh thu ngoại tệ {fmtNum(d.exposure.fxRevenueShare * 100, 0)}%, nợ ngoại tệ {fmtNum(d.exposure.fxDebtShare * 100, 0)}%, chi phí gắn với hàng hoá {fmtNum(d.exposure.commodityCostShare * 100, 0)}%.</p>
      <h3 className="h3">Độ nhạy sau khi co rút về ngành {d.sectorName}</h3>
      <p className="muted">Ước lượng riêng của mã nhiễu hơn của ngành nên bị kéo về mức ngành theo trọng số của dữ liệu. Điểm vuông: mức ngành; chấm xám: ước lượng riêng; chấm đậm: sau co rút.</p>
      <ul className="shrink">
        {d.betas.map((b) => (
          <li key={b.factor}>
            <span className="s-name"><strong>{b.nameVi}</strong><span className="muted">dữ liệu riêng {fmtNum(b.ownWeight * 100, 0)}%</span></span>
            <span className="s-track" role="img" aria-label={`${b.nameVi}: mức ngành ${fmtSigned(b.sectorPrior, 2)}, ước lượng riêng ${fmtSigned(b.own, 2)}, sau co rút ${fmtSigned(b.shrunk, 2)}`}>
              <span className="ci-zero" />
              <span className="s-ci" style={{ left: `${pos(b.own - 1.645 * b.se)}%`, width: `${Math.max(pos(b.own + 1.645 * b.se) - pos(b.own - 1.645 * b.se), 1)}%` }} />
              <span className="s-own" style={{ left: `${pos(b.own)}%` }} />
              <span className="s-prior" style={{ left: `${pos(b.sectorPrior)}%` }} />
              <span className="s-shrunk" style={{ left: `${pos(b.shrunk)}%` }} />
            </span>
            <span className="s-val"><strong>{fmtSigned(b.shrunk, 2)}</strong><EvidenceChip tier={b.tier} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
