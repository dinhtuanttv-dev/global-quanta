// Port từ locnganh-timing-engine (ui/sector-rotation/SectorScreenerCells.test.tsx).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '../../../../test/rtl-lite';
import {
  SectorConfidenceBadge,
  SectorExpectedReturnCell,
  SectorOptimalWindowCell,
  SectorReactionProbabilityCell,
  SectorScreenerCells,
} from './SectorScreenerCells';
import type { SectorTimingSignal } from '../../../../lib/locnganh/types';

afterEach(cleanup);

function makeSignal(o: Partial<SectorTimingSignal> = {}): SectorTimingSignal {
  return {
    sectorKey: 'THEP',
    action: 'IN_WINDOW',
    tdSinceTransition: 5,
    window: { entryFrom: -10, entryTo: -2, exitOffset: 5 },
    expectedNetReturn: 0.023,
    nEvents: 10,
    fdrQValue: 0.06,
    confidence: 'MEDIUM',
    reactionProbability: { mean: 0.68, ci: [0.52, 0.81] },
    ...o,
  };
}

describe('SectorOptimalWindowCell', () => {
  it('hiển thị cửa sổ, tô đậm khi IN_WINDOW', () => {
    render(<SectorOptimalWindowCell signal={makeSignal()} />);
    const el = screen.getByTestId('sector-window-cell');
    expect(el.textContent).toContain('[-10, -2]');
    expect(el.textContent).toContain('5');
  });
  it('window null + NO_SIGNAL ⇒ "Chưa đủ bằng chứng"', () => {
    render(<SectorOptimalWindowCell signal={makeSignal({ action: 'NO_SIGNAL', window: null })} />);
    expect(screen.getByTestId('sector-window-cell').textContent).toBe('Chưa đủ bằng chứng');
  });
  it('window null + NO_DATE ⇒ "Chưa có dữ liệu RRG"', () => {
    render(<SectorOptimalWindowCell signal={makeSignal({ action: 'NO_DATE', window: null, tdSinceTransition: null })} />);
    expect(screen.getByTestId('sector-window-cell').textContent).toBe('Chưa có dữ liệu RRG');
  });
});

describe('SectorExpectedReturnCell', () => {
  it('định dạng phần trăm có dấu, null ⇒ N/A không phải 0%', () => {
    render(<SectorExpectedReturnCell signal={makeSignal({ expectedNetReturn: 0.023 })} />);
    expect(screen.getByTestId('sector-return-cell').textContent).toBe('+2,3%');
    render(<SectorExpectedReturnCell signal={makeSignal({ expectedNetReturn: null })} />);
    expect(screen.getAllByTestId('sector-return-cell')[1].textContent).toBe('N/A');
  });
});

describe('SectorConfidenceBadge', () => {
  it('hiện nhãn và số sự kiện; null ⇒ gạch ngang', () => {
    render(<SectorConfidenceBadge signal={makeSignal({ confidence: 'HIGH', nEvents: 14 })} />);
    const t = screen.getByTestId('sector-confidence-badge').textContent ?? '';
    expect(t).toContain('Cao');
    expect(t).toContain('14');
    render(<SectorConfidenceBadge signal={makeSignal({ confidence: null })} />);
    expect(screen.getAllByTestId('sector-confidence-badge')[1].textContent).toBe('—');
  });
});

describe('SectorReactionProbabilityCell', () => {
  it('hiện mean, màu theo ngưỡng, tooltip có CI', () => {
    render(<SectorReactionProbabilityCell signal={makeSignal({ reactionProbability: { mean: 0.68, ci: [0.52, 0.81] } })} />);
    const el = screen.getByTestId('sector-prob-cell');
    expect(el.textContent).toBe('+68%');
    expect(el.getAttribute('title')).toContain('+52%');
    expect(el.getAttribute('title')).toContain('+81%');
  });
  it('null ⇒ N/A, không phải 0%', () => {
    render(<SectorReactionProbabilityCell signal={makeSignal({ reactionProbability: null })} />);
    expect(screen.getByTestId('sector-prob-cell').textContent).toBe('N/A');
  });
});

describe('SectorScreenerCells', () => {
  it('render đủ 4 <td>', () => {
    render(
      <table>
        <tbody>
          <tr>
            <SectorScreenerCells signal={makeSignal()} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelectorAll('td')).toHaveLength(4);
  });
});
