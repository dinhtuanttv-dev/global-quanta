import { useMemo } from 'react';
import type { FanChartBand } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

const WIDTH = 640;
const HEIGHT = 160;
const PADDING = 28;

/**
 * Fan Chart (dải xác suất P10-P90) hiển thị RIÊNG, trục X CỦA CHÍNH NÓ
 * (0..60 phiên TƯƠNG LAI kể từ hôm nay) - KHÔNG chia sẻ trục/canvas với
 * MainChart (biểu đồ giá lịch sử thật). Tách biệt vì 2 loại dữ liệu có ý
 * nghĩa khác nhau (thật vs. dự báo xác suất) - gộp chung trước đây làm
 * biểu đồ giá bị ép co lại, trông rối và không chuyên nghiệp.
 */
export function FanChartPanel({ fanChart }: { fanChart: FanChartBand[] }) {
  const { t } = useCfI18n();

  const { bandPathD, medianPathD, ready } = useMemo(() => {
    if (fanChart.length === 0) return { bandPathD: '', medianPathD: '', ready: false };

    const offsets = fanChart.map((b) => b.sessionOffset);
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);
    const xScaleFn = (offset: number) =>
      PADDING + ((offset - minOffset) / Math.max(maxOffset - minOffset, 1e-6)) * (WIDTH - PADDING * 2);

    const allValues = fanChart.flatMap((b) => [b.p10.value, b.p90.value]);
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const yScaleFn = (v: number) =>
      HEIGHT - PADDING - ((v - yMin) / Math.max(yMax - yMin, 1e-6)) * (HEIGHT - PADDING * 2);

    const upper = fanChart.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xScaleFn(b.sessionOffset)} ${yScaleFn(b.p90.value)}`);
    const lower = [...fanChart].reverse().map((b) => `L ${xScaleFn(b.sessionOffset)} ${yScaleFn(b.p10.value)}`);
    const bandPathD = [...upper, ...lower, 'Z'].join(' ');

    const medianPathD = fanChart
      .map((b, i) => `${i === 0 ? 'M' : 'L'} ${xScaleFn(b.sessionOffset)} ${yScaleFn(b.p50.value)}`)
      .join(' ');

    return { bandPathD, medianPathD, ready: true };
  }, [fanChart]);

  if (!ready) return null;

  return (
    <section className="cf-fanchart-panel">
      <h4>{t('chart.legend.fan')}</h4>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('chart.legend.fan')}>
        <path d={bandPathD} fill="var(--gold)" opacity={0.18} stroke="none" />
        <path d={medianPathD} fill="none" stroke="var(--gold)" strokeWidth={1.5} />
      </svg>
      <p className="cf-fanchart-caption">Ước tính từ phân vị (percentile) diễn biến giá của các chu kỳ lịch sử tương tự nhất</p>
    </section>
  );
}
