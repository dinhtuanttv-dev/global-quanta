import type { ConcentrationRisk } from '../../types';

interface Props {
  risk: ConcentrationRisk;
}

const ICON: Record<ConcentrationRisk['level'], string> = {
  low: '🛡️',
  medium: '⚠️',
  high: '🔴',
};

export default function ConcentrationRiskBanner({ risk }: Props) {
  const label = risk.level === 'low' ? 'Thấp' : risk.level === 'medium' ? 'Trung bình' : 'Cao';
  return (
    <div className="concentration-note">
      {ICON[risk.level]}
      <div>
        <b>Rủi ro tập trung: {label}.</b> {risk.note}
      </div>
    </div>
  );
}
