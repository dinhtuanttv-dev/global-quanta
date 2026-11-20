import { useState } from 'react';
import { fmtNum } from '../../macro-filter';
import { spillShade } from '../../world-view';
import { SpilloverNetwork } from './SpilloverNetwork';

export interface ConnectednessPayload {
  names: string[];
  recent: { table: number[][]; from: number[]; to: number[]; net: number[]; total: number };
  full: { total: number };
  rolling: { date: string; total: number }[];
  tailDependence: { market: string; nameVi: string; lowerTail: number; independentBaseline: number }[];
}

export function ConnectednessPanel({ data }: { data: ConnectednessPayload }) {
  const { names, recent } = data;
  const vn = names.length - 1;
  const lo = Math.min(...data.rolling.map((r) => r.total));
  const hi = Math.max(...data.rolling.map((r) => r.total));
  const span = hi - lo || 1;
  const last = data.rolling.slice(-36);
  // G4: rê chuột một ô -> tô cả hàng (CSS) và cả CỘT (trạng thái), để đọc "ai truyền sang ai" dễ hơn
  const [hc, setHc] = useState<number | null>(null);
  return (
    <div className="conn">
      {/* G5: mạng lan truyền dạng vòng — vẽ đúng bảng dưới, Việt Nam ở tâm */}
      <SpilloverNetwork names={names} table={recent.table} net={recent.net} vnIndex={vn} />
      <div className="scroll">
        <table className="spill" onMouseLeave={() => setHc(null)}>
          <caption className="sr-only">Mỗi hàng là một thị trường nhận biến động từ các thị trường ở cột, tính bằng phần trăm phương sai dự báo.</caption>
          <thead><tr><th scope="col">Nhận từ →</th>{names.map((n) => (<th key={n} scope="col">{n}</th>))}</tr></thead>
          <tbody>
            {recent.table.map((row, i) => (
              <tr key={names[i]} className={i === vn ? 'vn' : undefined}>
                <th scope="row">{names[i]}</th>
                {row.map((v, j) => {
                  const s = spillShade(v, i === j);
                  const style = i === j ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(s.alpha * 100)}%, transparent)`, color: s.strong ? 'var(--onAccent)' : 'var(--ink)' };
                  return <td key={j} className={[i === j ? 'diag' : '', hc === j ? 'hc' : ''].filter(Boolean).join(' ') || undefined} style={style} onMouseEnter={() => setHc(j)} title={`${names[i]} nhận từ ${names[j]}: ${fmtNum(v, 1)}%`}>{fmtNum(v, 0)}%</td>;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">Lan ra</th>{recent.to.map((v, j) => (<td key={j}><strong>{fmtNum(v, 0)}%</strong></td>))}</tr></tfoot>
        </table>
      </div>
      <p className="muted">Chỉ số lan truyền tổng gần đây: <strong>{fmtNum(recent.total, 0)}%</strong> (toàn mẫu {fmtNum(data.full.total, 0)}%). Đo trạng thái, không dự báo hướng đi.</p>
      <div className="spill-bars" role="img" aria-label={`Chỉ số lan truyền tổng ${last.length} kỳ gần nhất, từ ${fmtNum(lo, 0)}% đến ${fmtNum(hi, 0)}%`}>
        {last.map((r, i) => (<span key={r.date} className={`sb${i >= last.length - 3 ? ' now' : ''}`} style={{ height: `${Math.max(8, ((r.total - lo) / span) * 92 + 8)}%` }} title={`${r.date}: ${fmtNum(r.total, 1)}%`} />))}
      </div>
      {last.length > 0 && (
        <div className="spill-axis" aria-hidden="true"><span>{last[0].date}</span><span>thấp {fmtNum(lo, 0)}% · cao {fmtNum(hi, 0)}%</span><span>{last[last.length - 1].date}</span></div>
      )}
      <details className="cols-table">
        <summary>Xem dạng bảng</summary>
        <table>
          <caption className="sr-only">Chỉ số lan truyền tổng theo kỳ</caption>
          <thead><tr><th scope="col">Kỳ</th><th scope="col">Lan truyền tổng (%)</th></tr></thead>
          <tbody>{last.map((r) => <tr key={r.date}><th scope="row">{r.date}</th><td>{fmtNum(r.total, 1)}</td></tr>)}</tbody>
        </table>
      </details>
      <h3 className="h3">Phụ thuộc đuôi: cùng sụt mạnh với Việt Nam</h3>
      <ul className="tails">
        {data.tailDependence.map((t) => (
          <li key={t.market}><span>{t.nameVi}</span><span className="tail-track" aria-hidden="true"><span className="tail-base" style={{ width: `${t.independentBaseline * 100}%` }} /><span className="tail-val" style={{ width: `${Math.min(t.lowerTail, 1) * 100}%` }} /></span><strong>{fmtNum(t.lowerTail * 100, 0)}%</strong></li>
        ))}
      </ul>
      <p className="muted">Xác suất Việt Nam nằm trong 5% ngày tệ nhất khi thị trường kia cũng nằm trong 5% tệ nhất. Hai thị trường độc lập cho khoảng 5%.</p>
    </div>
  );
}
