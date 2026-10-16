interface RegimeBadgeProps {
  state: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

const LABEL: Record<RegimeBadgeProps['state'], string> = {
  RISK_ON: 'RISK-ON',
  RISK_OFF: 'RISK-OFF',
  NEUTRAL: 'TRUNG LẬP',
};

/** Risk-On Index đã kiểm định đặt trước 10 năm và KHÔNG ĐẠT (Gateway riskOnValidation/RON-results.md) — chỉ tham khảo. */
const HEURISTIC_NOTE = 'Risk-On Index (DXY 40% + VIX 30% + US10Y 30%) — heuristic: kiểm định đặt trước 10 năm KHÔNG ĐẠT (IC +0,05, KTC95 [−0,10; +0,22]). Chỉ tham khảo, không dùng trong quyết định Lọc ngành.';

export default function RegimeBadge({ state }: RegimeBadgeProps) {
  return (
    <div className={`regime-badge regime-${state.toLowerCase()}`} title={HEURISTIC_NOTE} aria-label={`${LABEL[state]} — ${HEURISTIC_NOTE}`}>
      <span className="dot" />
      {LABEL[state]}
      <sup style={{ fontSize: '0.7em', opacity: 0.7, marginLeft: 2 }}>*</sup>
    </div>
  );
}
