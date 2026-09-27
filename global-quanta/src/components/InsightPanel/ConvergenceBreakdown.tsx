import { CONVERGENCE_LABELS } from '../../types';

interface Props {
  name: string;
  score: number;
  convergence: number[];
}

export default function ConvergenceBreakdown({ name, score, convergence }: Props) {
  return (
    <div className="conv-panel">
      <div className="conv-caption">GIẢI TRÌNH HỘI TỤ — VÌ SAO TIN MÃ NÀY</div>
      <div className="conv-top">
        <span className="conv-name">{name}</span>
        <span className="conv-score">{score}/{CONVERGENCE_LABELS.length}</span>
      </div>
      <div className="conv-list">
        {convergence.map((v, i) => (
          <div className={`conv-item ${v ? '' : 'strikethrough'}`} key={CONVERGENCE_LABELS[i]}>
            <span className={`conv-dot ${v ? 'on' : 'off'}`} />
            {CONVERGENCE_LABELS[i]}
          </div>
        ))}
      </div>
    </div>
  );
}
