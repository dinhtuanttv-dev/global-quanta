import type { FilterState } from '../macro-filter';

interface Option { id: string; label: string }

function Chips({ label, options, selected, onToggle, onClear }: { label: string; options: Option[]; selected: string[]; onToggle: (id: string) => void; onClear: () => void }) {
  return (
    <div className="fb-row" role="group" aria-label={label}>
      <span className="fb-label">{label}</span>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={selected.length === 0} onClick={onClear}>Tất cả</button>
        {options.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={selected.includes(o.id)} onClick={() => onToggle(o.id)} title={o.label}>
            {o.id}
          </button>
        ))}
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="fb-row" role="group" aria-label={label}>
      <span className="fb-label">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function MacroFilterBar(props: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  factors: Option[];
  targets: Option[];
  maxLag: number;
}) {
  const { state, onChange } = props;
  const toggle = (key: 'factors' | 'targets') => (id: string) => {
    const cur = state[key];
    onChange({ ...state, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  return (
    <form className="fb" onSubmit={(e: { preventDefault(): void }) => e.preventDefault()} aria-label="Bộ lọc ma trận tác động">
      <Chips label="Chỉ số" options={props.targets} selected={state.targets} onToggle={toggle('targets')} onClear={() => onChange({ ...state, targets: [] })} />
      <Chips label="Biến vĩ mô" options={props.factors} selected={state.factors} onToggle={toggle('factors')} onClear={() => onChange({ ...state, factors: [] })} />
      <Seg label="Hướng" value={state.direction} onChange={(direction) => onChange({ ...state, direction })}
        options={[{ id: 'all', label: 'Cả hai' }, { id: '+', label: 'Tăng giá' }, { id: '-', label: 'Giảm giá' }]} />
      <Seg label="Bằng chứng" value={state.significance} onChange={(significance) => onChange({ ...state, significance })}
        options={[{ id: 'all', label: 'Tất cả ô' }, { id: 'significant', label: 'Có ý nghĩa' }, { id: 'stable', label: 'Ổn định' }]} />
      <div className="fb-row">
        <label className="fb-label" htmlFor="mc-lag">Độ trễ</label>
        <select id="mc-lag" value={String(state.lag)} onChange={(e: { target: { value: string } }) => onChange({ ...state, lag: e.target.value === 'best' ? 'best' : Number(e.target.value) })}>
          <option value="best">Tốt nhất mỗi cặp</option>
          {Array.from({ length: props.maxLag + 1 }, (_, i) => (
            <option key={i} value={i}>{i === 0 ? 'Cùng tháng' : `${i} tháng`}</option>
          ))}
        </select>
        <label className="fb-label" htmlFor="mc-t">|t| tối thiểu</label>
        <select id="mc-t" value={String(state.minAbsT)} onChange={(e: { target: { value: string } }) => onChange({ ...state, minAbsT: Number(e.target.value) })}>
          {[0, 2, 3, 4, 5].map((v) => (<option key={v} value={v}>{v === 0 ? 'Không giới hạn' : `≥ ${v}`}</option>))}
        </select>
      </div>
    </form>
  );
}
