import { useMemo } from 'react';
import type { AtrPoint, CycleMatch, PricePoint } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

/**
 * CF0 — 2 chế độ vẽ (nút chuyển ở CfPanel):
 * - `overlay` (mặc định): mẫu quá khứ đặt CHỒNG lên W phiên gần nhất (neo tại giá hôm nay = điểm kết thúc giai đoạn), nối tiếp
 *   bằng DIỄN BIẾN THẬT 60 phiên sau giai đoạn đó (forwardSeries) + trung vị. Đây mới là "sau những lần giống thế này thì giá đi đâu".
 * - `shape` (kiểu cũ, giữ theo yêu cầu): HÌNH DẠNG giai đoạn quá khứ (offset 0..W−1) đặt sang bên phải hôm nay, điểm đầu = giá hôm
 *   nay. KHÔNG phải dự báo — chỉ so hình dạng; chú thích ghi rõ.
 * Biểu đồ không nhận dữ liệu Fan Chart (panel riêng). Trục y bao mọi đường đang vẽ (trước đây chỉ theo giá -> đường mẫu tràn khung).
 */
export type MatchChartMode = 'overlay' | 'shape';

interface MainChartProps {
  priceSeries: PricePoint[];
  topMatches: CycleMatch[];
  atrSeries: AtrPoint[];
  useAtrAxis: boolean;
  highlightedKey: string | null;
  mode: MatchChartMode;
  unitLabel: string;
}

const WIDTH = 720;
const HEIGHT = 320;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 28;

export const matchKey = (m: CycleMatch) => `${m.ticker}:${m.matchStartDate}`;

function buildOffsetPositionMap(domainOffsets: number[], atrByOffset: Map<number, number>, useAtrAxis: boolean): Map<number, number> {
  const sorted = [...new Set(domainOffsets)].sort((a, b) => a - b);
  const positions = new Map<number, number>();
  if (sorted.length === 0) return positions;
  const fallbackAtr = atrByOffset.size > 0 ? [...atrByOffset.values()].reduce((s, v) => s + v, 0) / atrByOffset.size : 1;
  let cumulative = 0;
  const cumulatives: number[] = [0];
  for (let i = 1; i < sorted.length; i += 1) {
    const step = useAtrAxis ? (atrByOffset.get(sorted[i]) ?? fallbackAtr) : 1;
    cumulative += Math.max(step, 1e-6);
    cumulatives.push(cumulative);
  }
  const total = cumulatives[cumulatives.length - 1] || 1;
  sorted.forEach((offset, i) => positions.set(offset, cumulatives[i] / total));
  return positions;
}

type Pt = [offset: number, price: number];
interface MatchPaths { key: string; label: string; pattern: Pt[]; forward: Pt[] }

const fmtPrice = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString('vi-VN') : v.toFixed(2).replace('.', ','));
export const fmtCfDate = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function MainChart({ priceSeries, topMatches, atrSeries, useAtrAxis, highlightedKey, mode, unitLabel }: MainChartProps) {
  const { t } = useCfI18n();

  const view = useMemo(() => {
    if (priceSeries.length === 0) return null;
    const baseIdx = priceSeries.length - 1;
    const today = priceSeries[baseIdx].close.value;
    const atrByOffset = new Map(atrSeries.map((a) => [a.sessionOffset, a.atr.value]));

    const matches: MatchPaths[] = topMatches.map((m) => {
      const a = m.alignedSeries;
      const label = `${fmtCfDate(m.matchStartDate)} → ${fmtCfDate(m.matchEndDate)}`;
      if (mode === 'shape') {
        return { key: matchKey(m), label, pattern: a.map((p) => [p.sessionOffset, (p.normalizedClose.value / 100) * today] as Pt), forward: [] };
      }
      const W = a.length;
      const end = a[W - 1]?.normalizedClose.value || 100;
      return {
        key: matchKey(m), label,
        pattern: a.map((p, i) => [i - (W - 1), (p.normalizedClose.value / end) * today] as Pt),
        forward: (m.forwardSeries ?? []).map((p) => [p.sessionOffset, (p.normalizedClose.value / 100) * today] as Pt),
      };
    });

    // Trung vị diễn biến sau (chỉ chế độ overlay, khi có ≥ 3 đường đủ dài)
    const median: Pt[] = [];
    if (mode === 'overlay') {
      const maxK = Math.max(0, ...matches.map((m) => m.forward.length - 1));
      for (let k = 0; k <= maxK; k += 1) {
        const vs = matches.map((m) => m.forward[k]?.[1]).filter((v): v is number => v !== undefined).sort((p, q) => p - q);
        if (vs.length >= 3) median.push([k, vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2]);
      }
    }

    const priceOffsets = priceSeries.map((_, i) => i - baseIdx);
    const domain = [...priceOffsets, ...matches.flatMap((m) => [...m.pattern, ...m.forward].map((p) => p[0]))];
    const posMap = buildOffsetPositionMap(domain, atrByOffset, useAtrAxis);
    const x = (o: number) => PAD_L + (posMap.get(o) ?? 0) * (WIDTH - PAD_L - PAD_R);

    const all = [...priceSeries.map((p) => p.close.value), ...matches.flatMap((m) => [...m.pattern, ...m.forward].map((p) => p[1]))];
    const lo0 = Math.min(...all), hi0 = Math.max(...all), padY = (hi0 - lo0) * 0.04 || hi0 * 0.02 || 1;
    const lo = lo0 - padY, hi = hi0 + padY;
    const y = (v: number) => HEIGHT - PAD_B - ((v - lo) / Math.max(hi - lo, 1e-9)) * (HEIGHT - PAD_T - PAD_B);
    const path = (pts: Pt[]) => pts.map(([o, v], i) => `${i === 0 ? 'M' : 'L'} ${x(o).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

    const minO = Math.min(...domain), maxO = Math.max(...domain);
    return {
      price: path(priceSeries.map((p, i) => [i - baseIdx, p.close.value] as Pt)),
      matches: matches.map((m) => ({ ...m, patternD: path(m.pattern), forwardD: path(m.forward) })),
      medianD: path(median),
      x0: x(0), yToday: y(today),
      yTicks: [lo0, (lo0 + hi0) / 2, hi0].map((v) => ({ v, y: y(v) })),
      xTicks: [...new Set([minO, 0, maxO])].map((o) => ({ o, x: x(o) })),
    };
  }, [priceSeries, topMatches, atrSeries, useAtrAxis, mode]);

  if (!view) return null;
  // nhiều đường (engine v2: 30 giai đoạn) -> nhạt hơn để trung vị / đường đang chọn nổi lên
  const baseOpacity = topMatches.length > 10 ? 0.35 : 0.9;
  const dim = (k: string) => (highlightedKey ? (highlightedKey === k ? 1 : 0.12) : baseOpacity);
  const wide = (k: string) => (highlightedKey === k ? 2.5 : 1.2);

  return (
    <div className="cf-main-chart" data-testid="cf-main-chart" data-mode={mode}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        aria-label={mode === 'overlay' ? 'Giá thực tế, các giai đoạn tương tự đặt chồng lên hiện tại và diễn biến 60 phiên sau của chúng' : 'Giá thực tế và hình dạng các giai đoạn tương tự đặt sau hôm nay'}>
        {view.yTicks.map((tk) => (
          <g key={tk.v}>
            <line x1={PAD_L} x2={WIDTH - PAD_R} y1={tk.y} y2={tk.y} stroke="var(--bg-surface-2)" strokeWidth={1} />
            <text x={PAD_L - 6} y={tk.y + 3} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{fmtPrice(tk.v)}</text>
          </g>
        ))}
        {view.xTicks.map((tk) => (
          <text key={tk.o} x={tk.x} y={HEIGHT - 8} textAnchor={tk.o === 0 ? 'middle' : tk.o < 0 ? 'start' : 'end'} fontSize={10} fill="var(--text-tertiary)">
            {tk.o === 0 ? 'hôm nay' : `${tk.o > 0 ? '+' : ''}${tk.o} ${unitLabel}`}
          </text>
        ))}
        <line x1={view.x0} x2={view.x0} y1={PAD_T} y2={HEIGHT - PAD_B} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 3" data-testid="cf-today-line" />
        {view.matches.map((m) => (
          <g key={m.key} data-testid="cf-match-path">
            <path d={m.patternD} fill="none" stroke="var(--gold)" strokeWidth={wide(m.key)} strokeDasharray={mode === 'overlay' ? '2 3' : '4 3'} opacity={mode === 'overlay' ? dim(m.key) * 0.7 : dim(m.key)}>
              <title>{`Giai đoạn ${m.label}${mode === 'overlay' ? ' — mẫu đặt chồng lên hiện tại' : ' — hình dạng mẫu (không phải dự báo)'}`}</title>
            </path>
            {m.forwardD && (
              <path d={m.forwardD} fill="none" stroke="var(--gold)" strokeWidth={wide(m.key)} strokeDasharray="5 3" opacity={dim(m.key)} data-testid="cf-forward-path">
                <title>{`Giai đoạn ${m.label} — diễn biến thật sau đó`}</title>
              </path>
            )}
          </g>
        ))}
        {view.medianD && <path d={view.medianD} fill="none" stroke="var(--text-secondary)" strokeWidth={2} data-testid="cf-forward-median"><title>Trung vị diễn biến sau của các giai đoạn</title></path>}
        <path d={view.price} fill="none" stroke="var(--positive)" strokeWidth={2} />
        <circle cx={view.x0} cy={view.yToday} r={3.5} fill="var(--positive)" stroke="var(--bg-surface)" strokeWidth={2} />
      </svg>
      <p className="cf-chart-legend">
        <span className="cf-legend-item"><span className="cf-legend-dot cf-legend-dot--price" />{t('chart.legend.price')}</span>
        <span className="cf-legend-item"><span className="cf-legend-dot cf-legend-dot--match" />{mode === 'overlay' ? `${t('chart.legend.match')}: chấm = mẫu, gạch = diễn biến thật sau đó` : `${t('chart.legend.match')} (hình dạng)`}</span>
        {mode === 'overlay' && view.medianD && <span className="cf-legend-item"><span className="cf-legend-dot" style={{ background: 'var(--text-secondary)' }} />Trung vị diễn biến sau</span>}
      </p>
      <p className="cf-chart-caption" data-testid="cf-chart-caption">
        {mode === 'overlay'
          ? 'Mỗi giai đoạn quá khứ được đặt chồng lên các phiên gần nhất (neo tại giá hôm nay), rồi nối tiếp bằng diễn biến THẬT sau giai đoạn đó. Đây là kịch bản lịch sử, không phải dự báo.'
          : 'Chế độ hình dạng: đường vàng bên phải hôm nay là HÌNH DẠNG của chính các giai đoạn quá khứ (giống các phiên gần nhất), KHÔNG phải diễn biến sau đó và KHÔNG phải dự báo.'}
      </p>
    </div>
  );
}
