import type { EvidenceTier } from '../../world-types';
import { DEFAULT_WORLD_FILTER, cellAria, worldCellKey, type WorldFilter, type WorldMatrixView } from '../../world-view';

export function WorldMatrix(props: { view: WorldMatrixView; selected: string | null; onSelect: (factor: string, sector: string) => void }) {
  const { view } = props;
  if (!view.factors.length) return <p className="state">Không có ô nào khớp bộ lọc{view.hidden ? ` (đang ẩn ${view.hidden} ô)` : ''}. Nới bộ lọc để xem lại.</p>;
  return (
    <div>
      <div className="scroll">
        <table className="wm">
          <caption className="sr-only">Ma trận tác động của yếu tố thế giới lên ngành Việt Nam. Mũi tên là hướng tác động, chữ cái là bậc bằng chứng.</caption>
          <thead>
            <tr>
              <th scope="col">Ngành</th>
              {view.factors.map((f) => (<th key={f.id} scope="col" title={f.channelVi}>{f.nameVi}</th>))}
            </tr>
          </thead>
          <tbody>
            {view.sectors.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.nameVi}</th>
                {view.factors.map((f) => {
                  const key = worldCellKey(f.id, s.id);
                  const c = view.cells[key];
                  if (!c) return <td key={f.id}><span className="cell none">–</span></td>;
                  const dir = c.direction === '+' ? 'up' : 'down';
                  return (
                    <td key={f.id}>
                      <button type="button" className={`cell ${c.level === 0 ? 'l0' : `${dir} l${c.level}`}${c.unstable ? ' unstable' : ''}`} aria-pressed={props.selected === key} aria-label={cellAria(c, f.nameVi, s.nameVi)} onClick={() => props.onSelect(f.id, s.id)}>
                        {c.level > 0 && <span className="arrow" aria-hidden="true">{c.direction === '+' ? '↑' : '↓'}</span>}
                        {c.level > 0 && <span className="tier" aria-hidden="true">{c.tier}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="legend" aria-label="Chú giải">
        <li><i className="lg solid" />Đặc: vượt hiệu chỉnh kiểm định bội ({view.counts.A + view.counts.B} ô)</li>
        <li><i className="lg hatch" />Sọc: chưa đủ bằng chứng ({view.counts.C} ô)</li>
        <li><i className="lg notch" />Góc vàng: không ổn định theo thời gian</li>
        <li>Bậc A: vượt kiểm định ngoài mẫu. Bậc B: có ý nghĩa trong mẫu. Bậc C: giả thuyết.</li>
      </ul>
    </div>
  );
}

interface Opt { id: string; label: string }

export function WorldFilterBar(props: { state: WorldFilter; onChange: (f: WorldFilter) => void; channels: Opt[]; tiers?: EvidenceTier[] }) {
  const { state, onChange } = props;
  const tiers: EvidenceTier[] = props.tiers ?? ['A', 'B', 'C'];
  const toggleTier = (t: EvidenceTier) => onChange({ ...state, tiers: state.tiers.includes(t) ? state.tiers.filter((x) => x !== t) : [...state.tiers, t] });
  return (
    <form className="fbar" aria-label="Bộ lọc ma trận thế giới" onSubmit={(e: { preventDefault(): void }) => e.preventDefault()}>
      <div className="frow" role="group" aria-label="Bậc bằng chứng">
        <span className="flabel">Bằng chứng</span>
        <button type="button" className="chip" aria-pressed={state.tiers.length === 0} onClick={() => onChange({ ...state, tiers: [] })}>Tất cả</button>
        {tiers.map((t) => (<button key={t} type="button" className="chip" aria-pressed={state.tiers.includes(t)} onClick={() => toggleTier(t)}>Bậc {t}</button>))}
      </div>
      <div className="frow" role="group" aria-label="Hướng tác động">
        <span className="flabel">Hướng</span>
        {([['all', 'Cả hai'], ['+', 'Tăng giá'], ['-', 'Giảm giá']] as const).map(([v, l]) => (
          <button key={v} type="button" className="chip" aria-pressed={state.direction === v} onClick={() => onChange({ ...state, direction: v })}>{l}</button>
        ))}
      </div>
      <div className="frow">
        <label className="flabel" htmlFor="wd-channel">Kênh truyền dẫn</label>
        <select id="wd-channel" value={state.channel} onChange={(e: { target: { value: string } }) => onChange({ ...state, channel: e.target.value })}>
          <option value="all">Tất cả kênh</option>
          {props.channels.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
        </select>
        <button type="button" className="chip" onClick={() => onChange(DEFAULT_WORLD_FILTER)}>Đặt lại</button>
      </div>
    </form>
  );
}
