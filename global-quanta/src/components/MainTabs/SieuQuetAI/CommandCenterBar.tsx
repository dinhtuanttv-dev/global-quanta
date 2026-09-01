import ScenarioSwitcher from './ScenarioSwitcher';
import type { Scenario } from '../../../types/tang1';

interface Props {
  scenario: Scenario;
  onScenarioChange: (s: Scenario) => void;
}

export default function CommandCenterBar({ scenario, onScenarioChange }: Props) {
  return (
    <div 
      className='command-center-bar'
      style={{
        backgroundColor: '#1a2332',
        padding: '12px 16px',
        borderBottom: '2px solid #3b82f6',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        minHeight: '50px',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <span 
        className='ccb-label'
        style={{
          color: '#f59e0b',
          fontWeight: 700,
          fontSize: '13px',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap'
        }}
      >
        KICH BAN PHAN TICH
      </span>
      <ScenarioSwitcher value={scenario} onChange={onScenarioChange} />
    </div>
  );
}
