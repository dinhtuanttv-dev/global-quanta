import { fmtNum } from '../macro-filter';
import type { ThermoPayload } from './types';

export function MacroThermometer({ data, names }: { data: ThermoPayload; names: Record<string, string> }) {
  const t = data.thermometer;
  if (!t) return <p className="state">Chưa đủ dữ liệu để tính nhiệt kế vĩ mô.</p>;
  const left = ((Math.max(-1, Math.min(1, t.value)) + 1) / 2) * 100;
  return (
    <div>
      <div className="thermo-head">
        <span className="thermo-band">{t.bandVi}</span>
        <span className="thermo-value">
          điểm {fmtNum(t.value, 2)} cho {names[data.target] ?? data.target}, kỳ {t.period}
        </span>
      </div>
      <div className="thermo-scale" role="img" aria-label={`Nhiệt kế vĩ mô: ${t.bandVi}, điểm ${fmtNum(t.value, 2)} trên thang từ −1 đến +1`}>
        <i /><i /><i /><i /><i />
        <span className="thermo-marker" style={{ left: `${left}%` }} />
      </div>
      <div className="thermo-ticks" aria-hidden="true"><span>−1</span><span>0</span><span>+1</span></div>
      {t.topContributors.length > 0 && (
        <ul className="thermo-contrib" aria-label="Yếu tố đóng góp nhiều nhất vào lợi suất kỳ vọng">
          {t.topContributors.map((c) => (
            <li key={c.factor}>
              {names[c.factor] ?? c.factor}: <b data-sign={c.contribution >= 0 ? '+' : '-'}>{c.contribution >= 0 ? '+' : ''}{fmtNum(c.contribution, 2)}%/tháng</b>
            </li>
          ))}
        </ul>
      )}
      <p className="gate" data-pass={String(data.usableForDecisions)}>
        {data.gateNote}
        {data.backtest && ` (IC ngoài mẫu ${fmtNum(data.backtest.ic, 2)}, đúng hướng ${fmtNum(data.backtest.hitRate * 100, 0)}%)`}
      </p>
    </div>
  );
}
