interface RegimeBadgeProps {
  state: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

const LABEL: Record<RegimeBadgeProps['state'], string> = {
  RISK_ON: 'RISK-ON',
  RISK_OFF: 'RISK-OFF',
  NEUTRAL: 'TRUNG LẬP',
};

export default function RegimeBadge({ state }: RegimeBadgeProps) {
  return (
    <div className={`regime-badge regime-${state.toLowerCase()}`}>
      <span className="dot" />
      {LABEL[state]}
    </div>
  );
}
