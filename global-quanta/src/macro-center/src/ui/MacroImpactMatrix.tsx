import { cellKey, fmtNum, type MatrixView } from '../macro-filter';

const STATUS_VI: Record<string, string> = {
  stable: 'có ý nghĩa, ổn định',
  unstable: 'có ý nghĩa, không ổn định',
  significant: 'có ý nghĩa',
  insignificant: 'chưa đủ bằng chứng',
};

export function MacroImpactMatrix(props: {
  view: MatrixView;
  factorNames: Record<string, string>;
  targetNames: Record<string, string>;
  selected: string | null;
  onSelect: (factor: string, target: string) => void;
}) {
  const { view } = props;
  if (view.factors.length === 0)
    return <p className="state">Không có ô nào khớp bộ lọc{view.hiddenByFilter ? ` (đang ẩn ${view.hiddenByFilter} ô)` : ''}. Nới bộ lọc để xem lại.</p>;
  return (
    <div>
      <div className="mx-wrap">
        <table className="mx">
          <caption className="sr-only">Ma trận tác động của biến vĩ mô lên chỉ số cổ phiếu; mỗi ô là thống kê t của hệ số.</caption>
          <thead>
            <tr>
              <th scope="col">Biến vĩ mô</th>
              {view.targets.map((t) => (<th key={t} scope="col" title={props.targetNames[t]}>{t}</th>))}
            </tr>
          </thead>
          <tbody>
            {view.factors.map((f) => (
              <tr key={f}>
                <th scope="row">{f}<small>{props.factorNames[f]}</small></th>
                {view.targets.map((t) => {
                  const c = view.cells[cellKey(f, t)];
                  if (!c) return <td key={t} className="mx-empty">–</td>;
                  const key = cellKey(f, t);
                  const label = `${f} lên ${props.targetNames[t] ?? t}: t = ${fmtNum(c.t, 1)}, hệ số ${fmtNum(c.beta, 2)}, độ trễ ${c.lag} tháng, ${STATUS_VI[c.status]}`;
                  return (
                    <td key={t}>
                      <button type="button" className="mx-cell" data-status={c.status} data-dir={c.direction} data-strong={String(c.significant && c.intensity > 0.55)}
                        style={{ ['--i' as string]: c.intensity.toFixed(2) }} aria-pressed={props.selected === key} aria-label={label} onClick={() => props.onSelect(f, t)}>
                        <strong>{fmtNum(c.t, 1)}</strong>
                        <span>trễ {c.lag}</span>
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
        <li><i className="l-solid" />Ô đặc: vượt hiệu chỉnh kiểm định bội ({view.counts.stable + view.counts.unstable + view.counts.significant} ô)</li>
        <li><i className="l-hatch" />Ô sọc: chưa đủ bằng chứng ({view.counts.insignificant} ô)</li>
        <li><i className="l-notch" />Góc vàng: không ổn định theo thời gian ({view.counts.unstable} ô)</li>
      </ul>
      <p className="muted">Số trong ô là thống kê t (sai số chuẩn HAC). Xanh: chỉ số tăng khi biến tăng; đỏ: giảm. Độ trễ tính theo tháng sau thời điểm số liệu được công bố.</p>
    </div>
  );
}
