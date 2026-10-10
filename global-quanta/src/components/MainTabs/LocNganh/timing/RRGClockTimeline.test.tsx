// Port từ locnganh-timing-engine (ui/sector-rotation/RRGClockTimeline.test.tsx).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '../../../../test/rtl-lite';
import { RRGClockTimeline } from './RRGClockTimeline';
import type { SectorRRGHistory } from './RRGClockTimeline';
import type { Quadrant, RRGPoint } from '../../../../lib/locnganh/types';

afterEach(cleanup);

function pt(rsRatio: number, rsMomentum: number, quadrant: Quadrant, date = '2026-10-01'): RRGPoint {
  return { sectorKey: 'THEP', sectorLabel: 'Thép', rsRatio, rsMomentum, quadrant, asOf: date };
}

function sector(o: Partial<SectorRRGHistory> = {}): SectorRRGHistory {
  return {
    sectorKey: 'THEP',
    sectorLabel: 'Thép',
    points: [pt(95, 95, 'LAGGING'), pt(96, 103, 'IMPROVING')],
    reactionProbabilityMean: 0.68,
    isFreshlyInTarget: true,
    ...o,
  };
}

describe('RRGClockTimeline', () => {
  it('rỗng ⇒ thông báo, không crash', () => {
    render(<RRGClockTimeline sectors={[]} />);
    expect(screen.getByTestId('rrg-clock-empty')).toBeTruthy();
  });

  it('vẽ được một ngành, hiện nhãn sectorKey', () => {
    render(<RRGClockTimeline sectors={[sector()]} />);
    expect(screen.getByTestId('rrg-sector-THEP')).toBeTruthy();
    expect(document.body.textContent).toContain('THEP');
  });

  it('isFreshlyInTarget ⇒ có marker riêng', () => {
    render(<RRGClockTimeline sectors={[sector({ isFreshlyInTarget: true })]} />);
    expect(screen.getByTestId('rrg-fresh-THEP')).toBeTruthy();
  });
  it('không fresh ⇒ không có marker riêng', () => {
    render(<RRGClockTimeline sectors={[sector({ isFreshlyInTarget: false })]} />);
    expect(screen.queryByTestId('rrg-fresh-THEP')).toBeNull();
  });

  it('hover hiện chi tiết: nhãn ngành, quadrant, xác suất', () => {
    render(<RRGClockTimeline sectors={[sector()]} />);
    fireEvent.mouseEnter(screen.getByTestId('rrg-sector-THEP'));
    const detail = screen.getByTestId('rrg-clock-detail').textContent ?? '';
    expect(detail).toContain('Thép');
    expect(detail).toContain('Cải thiện');
    expect(detail).toContain('68%');
    expect(detail).toContain('vừa chuyển quadrant');
  });
  it('rời chuột ⇒ về trạng thái gợi ý mặc định', () => {
    render(<RRGClockTimeline sectors={[sector()]} />);
    fireEvent.mouseEnter(screen.getByTestId('rrg-sector-THEP'));
    fireEvent.mouseLeave(screen.getByTestId('rrg-sector-THEP'));
    expect(screen.getByTestId('rrg-clock-detail').textContent).toContain('Di chuột');
  });

  it('click gọi onSelectSector đúng sectorKey', () => {
    let selected: string | null = null;
    render(<RRGClockTimeline sectors={[sector()]} onSelectSector={(k) => (selected = k)} />);
    fireEvent.click(screen.getByTestId('rrg-sector-THEP'));
    expect(selected).toBe('THEP');
  });

  it('reactionProbabilityMean = null ⇒ không hiện "P(outperform)" khi hover', () => {
    render(<RRGClockTimeline sectors={[sector({ reactionProbabilityMean: null })]} />);
    fireEvent.mouseEnter(screen.getByTestId('rrg-sector-THEP'));
    expect(screen.getByTestId('rrg-clock-detail').textContent).not.toContain('P(outperform)');
  });

  it('ngành có points rỗng bị bỏ qua, không crash', () => {
    render(<RRGClockTimeline sectors={[sector({ points: [] }), sector({ sectorKey: 'DAUKHI', sectorLabel: 'Dầu khí' })]} />);
    expect(screen.queryByTestId('rrg-sector-THEP')).toBeNull();
    expect(screen.getByTestId('rrg-sector-DAUKHI')).toBeTruthy();
  });

  it('nhiều ngành cùng lúc không NaN/undefined trong DOM', () => {
    render(
      <RRGClockTimeline
        sectors={[sector(), sector({ sectorKey: 'DAUKHI', sectorLabel: 'Dầu khí', points: [pt(104, 104, 'LEADING')], isFreshlyInTarget: false })]}
      />,
    );
    expect(document.body.innerHTML).not.toMatch(/NaN|undefined/);
  });
});
