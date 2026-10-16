import { fmtNum } from '../../macro-filter';

export interface PulseItem { id: string; nameVi: string; z: number; unusual: boolean; links: number }

export function WorldPulse({ pulse }: { pulse: PulseItem[] }) {
  return (
    <ul className="pulse" aria-label="Nhịp đập thế giới">
      {pulse.map((p) => {
        const mag = Math.min(Math.abs(p.z) / 3, 1) * 50;
        const sign = p.z > 0 ? '+' : p.z < 0 ? '−' : '';
        return (
          <li key={p.id} className="pulse-card">
            <div className="pulse-head"><span className="pulse-name">{p.nameVi}</span>{p.unusual && <span className="chip-warn">Bất thường</span>}</div>
            <div className="pulse-z"><strong>{sign}{fmtNum(Math.abs(p.z), 1)}</strong> <span className="muted">độ lệch chuẩn</span></div>
            <span className="pulse-track" aria-hidden="true">
              <span className="pulse-zero" />
              <span className="pulse-bar" style={{ left: `${p.z >= 0 ? 50 : 50 - mag}%`, width: `${mag}%` }} />
            </span>
            <span className="muted">{p.links} ngành có liên kết</span>
          </li>
        );
      })}
    </ul>
  );
}
