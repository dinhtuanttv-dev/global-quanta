import { LineStyle } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';
import { useLayoutEffect, useRef, useMemo } from 'react';
import type { OhlcBar, ElliottData } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';
import { elliottState } from '../../../../lib/quant-core/elliott';
import { elliottCountPoints } from '../../../../lib/ta-command-center/chart/elliottScene';
import type { OhlcvBar } from '../../../../lib/ta-command-center/types';

export interface WavePivot {
  time: string;
  price: number;
  label: string;
  isHigh: boolean;
  fibInfo?: string;
}

export interface ElliottCalculationResult {
  pivots: WavePivot[];
  isValidImpulse: boolean;
  violations: string[];
  isUptrend: boolean;
  summary: string;
}

const CIRCLED: Record<string, string> = { "0": "⓪", "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤", A: "Ⓐ", B: "Ⓑ", C: "Ⓒ" };
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Cấu trúc sóng Elliott cho biểu đồ Elite 10 — DÙNG CHUNG engine GET của tab TA (quant-core/elliott, E6):
 * đa bậc sóng, điều kiện Elliott Oscillator, bảng tỷ lệ sóng VN. Chỉ vẽ cấu trúc CÒN HIỆU LỰC (≤ 3 pivot sau điểm cuối);
 * không có thì không vẽ (thay cho zigzag 90 nến cũ luôn ghép 6 pivot cuối kể cả khi vi phạm quy tắc).
 */
export function computeElliottStructure(priceSeries: OhlcBar[]): ElliottCalculationResult {
  const empty = (summary: string): ElliottCalculationResult => ({ pivots: [], isValidImpulse: false, violations: [], isUptrend: true, summary });
  if (priceSeries.length < 60) return empty('Chưa đủ dữ liệu nến (cần ≥ 60)');
  const bars: OhlcvBar[] = priceSeries.map((b) => ({ date: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
  const st = elliottState(bars);
  const cnt = st?.scenario ? elliottCountPoints(st) : null;
  if (!st || !cnt) return empty(st?.label ?? 'Chưa có cấu trúc 5 sóng rõ ràng');
  const up = st.dir === 'up', r = st.scenario!.ratios;
  const fib: Record<string, string> = { '2': `Hồi ${pct(r.w2)} W1`, '3': `Ext ${pct(r.w3)} W1`, '4': `Hồi ${pct(r.w4)} W3` };
  const pivots: WavePivot[] = cnt.points.map((p, k) => {
    const raw = cnt.labels[k], base = raw.replace('?', '');
    return {
      time: p.date, price: p.price,
      label: `${CIRCLED[base] ?? base}${raw.endsWith('?') ? '?' : ''}`,
      isHigh: (up ? ['1', '3', '5', 'B'] : ['0', '2', '4', 'A', 'C']).includes(base),
      fibInfo: fib[base],
    };
  });
  const w = st.weight != null ? ` · trọng số tương đối ${Math.round(st.weight * 100)}%` : '';
  return { pivots, isValidImpulse: true, violations: [], isUptrend: up, summary: `${st.label}${w}` };
}

export function ElliottWaveSeries({
  priceSeries,
  elliott,
  showElliott,
}: {
  priceSeries: OhlcBar[];
  elliott?: ElliottData | null;
  showElliott: boolean;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const analysis = useMemo(() => {
    if (!showElliott || priceSeries.length === 0) return null;
    return computeElliottStructure(priceSeries);
  }, [priceSeries, showElliott]);

  useLayoutEffect(() => {
    let chart;
    try {
      chart = chartCtx.api();
    } catch {
      return;
    }

    if (!showElliott || !analysis || analysis.pivots.length === 0) {
      if (lineSeriesRef.current) {
        try {
          chart.removeSeries(lineSeriesRef.current);
        } catch {
          /* an toan */
        }
        lineSeriesRef.current = null;
      }
      return;
    }

    try {
      if (!lineSeriesRef.current) {
        // Màu sắc: Tím sáng (#c084fc) nếu sóng chuẩn, Vàng cam (#f59e0b) nếu có cảnh báo vi phạm
        lineSeriesRef.current = chart.addLineSeries({
          color: analysis.isValidImpulse ? '#c084fc' : '#f59e0b',
          lineWidth: analysis.isValidImpulse ? 2 : 1,
          lineStyle: analysis.isValidImpulse ? LineStyle.Solid : LineStyle.Dashed,
          lastValueVisible: false,
          priceLineVisible: false,
        });
      } else {
        // Cập nhật thuộc tính màu sắc theo tính hợp lệ của sóng
        lineSeriesRef.current.applyOptions({
          color: analysis.isValidImpulse ? '#c084fc' : '#f59e0b',
          lineWidth: analysis.isValidImpulse ? 2 : 1,
          lineStyle: analysis.isValidImpulse ? LineStyle.Solid : LineStyle.Dashed,
        });
      }

      const lineSeries = lineSeriesRef.current;
      const lineData = analysis.pivots.map((p) => ({
        time: p.time as never,
        value: p.price,
      }));

      lineSeries.setData(lineData);

      // Thêm các marker nhãn số sóng ⓪-⑤ và Ⓐ-Ⓒ kèm tỷ lệ Fibonacci
      const markers = analysis.pivots.map((p) => {
        const isPeak = p.isHigh;
        const displayText = p.fibInfo ? `${p.label} (${p.fibInfo})` : p.label;

        return {
          time: p.time as never,
          position: (isPeak ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
          color: analysis.isValidImpulse
            ? isPeak
              ? '#c084fc'
              : '#38bdf8'
            : isPeak
              ? '#fbbf24'
              : '#f59e0b',
          shape: (isPeak ? 'arrowDown' : 'arrowUp') as 'arrowDown' | 'arrowUp',
          text: displayText,
        };
      });

      // Set marker lên line series để hiển thị chuẩn xác
      lineSeries.setMarkers(markers);
    } catch {
      /* chart da dispose, bo qua an toan */
    }

    return () => {
      if (lineSeriesRef.current) {
        try {
          chart.removeSeries(lineSeriesRef.current);
        } catch {
          /* an toan */
        }
        lineSeriesRef.current = null;
      }
    };
  }, [showElliott, analysis, chartCtx]);

  return null;
}

