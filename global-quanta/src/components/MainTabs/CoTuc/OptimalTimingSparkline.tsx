import { useMemo } from 'react';
import { useCyclePaths } from '../../../hooks/useCyclePaths';
import { buildCurve, xDomain, yDomain } from '../../../lib/cotuc/cycle-timeline.utils';
import type { TimingSignal } from '../../../lib/cotuc/timing-types';

/**
 * GIAI DOAN 1 (ra soat "Optimal Timing", muc "Screener timing cells
 * chi la text tho"): mini SVG sparkline THAY THE text tho "[entryFrom,
 * entryTo] -> exitOffset" trong bang Screener - hien truc quan duong
 * CAR that (khong phai gia lap), dai mua toi uu, vi tri "hom nay".
 *
 * QUYET DINH DA XAC NHAN VOI NGUOI DUNG: GIU DUNG thiet ke goc (duong
 * CAR DAY DU, tu goi useCyclePaths(ticker) RIENG cho MOI dong bang) -
 * CHAP NHAN N request dong thoi (N = so ma hien trong Screener) thay
 * vi phien ban don gian hoa chi dung du lieu co san trong TimingSignal.
 * SWR (dedupingInterval trong useCyclePaths) se tu dedupe neu cung
 * ticker duoc render lai (VD sort/filter khong doi danh sach ma).
 */

const WIDTH = 120;
const HEIGHT = 36;
const PAD = 3;

export function OptimalTimingSparkline({ ticker, signal }: { ticker: string; signal: TimingSignal }) {
  const { data: paths, status } = useCyclePaths(ticker);

  const geometry = useMemo(() => {
    if (!paths || paths.offsets.length < 2) return null;
    const curve = buildCurve(paths);
    const win = signal.window;
    const xd = xDomain(paths, win ? { ...win, id: '', label: '', holdsThroughEx: false, nEvents: 0, nEff: 0, meanCarRaw: 0, meanCarShrunk: 0, netExpectancy: 0, netExpectancyLcb: 0, winRate: 0, oosHitRate: 0, oosMeanNet: null, fdrQValue: 0, selected: true } : null, signal.tdToEx !== null ? -signal.tdToEx : null);
    const yd = yDomain(curve, paths.currentPath);
    const sx = (v: number) => PAD + ((v - xd[0]) / (xd[1] - xd[0] || 1)) * (WIDTH - PAD * 2);
    const sy = (v: number) => HEIGHT - PAD - ((v - yd[0]) / (yd[1] - yd[0] || 1)) * (HEIGHT - PAD * 2);

    const currentLinePoints = paths.currentPath
      ? paths.offsets
          .map((o, i) => (paths.currentPath![i] !== null ? `${sx(o)},${sy(paths.currentPath![i]!)}` : null))
          .filter((p): p is string => p !== null)
          .join(' ')
      : null;

    const buyZoneX = win ? [sx(win.entryFrom), sx(win.entryTo)] : null;
    const todayOffset = signal.tdToEx !== null ? -signal.tdToEx : null;
    const todayX = todayOffset !== null && todayOffset >= xd[0] && todayOffset <= xd[1] ? sx(todayOffset) : null;
    const zeroY = sy(0);

    return { currentLinePoints, buyZoneX, todayX, zeroY };
  }, [paths, signal.window, signal.tdToEx]);

  if (status === 'loading') {
    return <div style={{ width: WIDTH, height: HEIGHT, background: 'var(--ct-grid, #dde3e9)', opacity: 0.3, borderRadius: 4 }} />;
  }
  if (!geometry) {
    return <span style={{ fontSize: 10, color: 'var(--ct-muted, #5d6b78)' }}>Chưa đủ dữ liệu</span>;
  }

  const isActive = signal.action === 'IN_WINDOW';

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Đường CAR ${ticker}`}>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={4} fill="var(--ct-grid, #dde3e9)" opacity={0.15} />
      {geometry.buyZoneX && (
        <rect
          x={Math.min(geometry.buyZoneX[0], geometry.buyZoneX[1])}
          y={0}
          width={Math.abs(geometry.buyZoneX[1] - geometry.buyZoneX[0])}
          height={HEIGHT}
          fill="var(--ct-buy, #1e9e5a)"
          opacity={0.12}
        />
      )}
      <line x1={PAD} y1={geometry.zeroY} x2={WIDTH - PAD} y2={geometry.zeroY} stroke="var(--ct-grid, #dde3e9)" strokeWidth={1} strokeDasharray="2,2" />
      {geometry.currentLinePoints && (
        <polyline points={geometry.currentLinePoints} fill="none" stroke="var(--ct-line, #0d6b8f)" strokeWidth={1.5} />
      )}
      {geometry.todayX !== null && (
        <>
          <line x1={geometry.todayX} y1={0} x2={geometry.todayX} y2={HEIGHT} stroke="var(--ct-today, #d6336c)" strokeWidth={1} />
          {isActive && <circle cx={geometry.todayX} cy={geometry.zeroY} r={3} fill="var(--ct-today, #d6336c)"><animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" /></circle>}
        </>
      )}
    </svg>
  );
}

const ACTION_BADGE: Record<TimingSignal['action'], { label: string; color: string }> = {
  IN_WINDOW: { label: '🟢 MUA', color: 'var(--ct-buy, #1e9e5a)' },
  TOO_EARLY: { label: '⏳ CHỜ', color: 'var(--ct-muted, #5d6b78)' },
  WINDOW_PASSED: { label: '⚪ QUA CỬA SỔ', color: 'var(--ct-muted, #5d6b78)' },
  POST_EX: { label: '◻ ĐÃ QUA GDKHQ', color: 'var(--ct-muted, #5d6b78)' },
  NO_SIGNAL: { label: '— CHƯA ĐỦ TÍN HIỆU', color: 'var(--ct-muted, #5d6b78)' },
  NO_DATE: { label: '— CHƯA CÓ NGÀY', color: 'var(--ct-muted, #5d6b78)' },
};

export function OptimalActionBadge({ action }: { action: TimingSignal['action'] }) {
  const b = ACTION_BADGE[action];
  return <span style={{ fontSize: 10, fontWeight: 700, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>;
}
