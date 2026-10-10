// Port từ locnganh-timing-engine (ui/decision/SignalTrackingPanel.test.tsx).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '../../../../test/rtl-lite';
import { SignalTrackingPanel } from './SignalTrackingPanel';
import type { TrackingSummary } from './SignalTrackingPanel';
import { createCusumState } from '../../../../lib/locnganh/signal-tracking-log';

afterEach(cleanup);

function summary(o: Partial<TrackingSummary> = {}): TrackingSummary {
  return { totalSignals: 20, resolvedSignals: 15, rollingAccuracy: 0.6, rollingWindowSize: 20, brierScore: 0.18, cusum: createCusumState(), ...o };
}

describe('SignalTrackingPanel', () => {
  it('hiển thị đủ số liệu cơ bản', () => {
    render(<SignalTrackingPanel summary={summary()} />);
    expect(screen.getByTestId('tracking-total').textContent).toContain('20');
    expect(screen.getByTestId('tracking-total').textContent).toContain('15');
    expect(screen.getByTestId('tracking-accuracy').textContent).toBe('60%');
    expect(screen.getByTestId('tracking-brier').textContent).toContain('0.180');
  });

  it('chưa có kết quả nào ⇒ N/A, có ghi chú giải thích, không crash', () => {
    render(<SignalTrackingPanel summary={summary({ resolvedSignals: 0, rollingAccuracy: null, brierScore: null })} />);
    expect(screen.getByTestId('tracking-accuracy').textContent).toBe('N/A');
    expect(screen.getByTestId('tracking-brier').textContent).toContain('N/A');
    expect(screen.getByTestId('tracking-empty')).toBeTruthy();
  });

  it('CUSUM báo động LOW ⇒ hiện banner cảnh báo suy giảm', () => {
    render(<SignalTrackingPanel summary={summary({ cusum: { posSum: 0, negSum: -8, n: 40, alarmed: true, alarmDirection: 'LOW' } })} />);
    expect(screen.getByTestId('cusum-alarm').textContent).toContain('SUY GIẢM');
  });

  it('CUSUM không báo động ⇒ không hiện banner', () => {
    render(<SignalTrackingPanel summary={summary()} />);
    expect(screen.queryByTestId('cusum-alarm')).toBeNull();
  });

  it('không có rollingWindowSize ⇒ không hiện chú thích "(N gần nhất)"', () => {
    render(<SignalTrackingPanel summary={summary({ rollingWindowSize: undefined })} />);
    expect(screen.getByText('Tỷ lệ đúng').textContent).toBe('Tỷ lệ đúng');
  });
});
