import { LineStyle } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';
import { useLayoutEffect, useRef, useMemo } from 'react';
import type { OhlcBar, ElliottData } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

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

/**
 * Tìm các đỉnh/đáy cục bộ (zigzag swing points) xen kẽ nhau với bán kính xác định
 */
function findAlternatingSwings(
  bars: OhlcBar[],
  radius: number
): { index: number; bar: OhlcBar; isHigh: boolean; price: number }[] {
  const rawPivots: { index: number; bar: OhlcBar; isHigh: boolean; price: number }[] = [];

  for (let i = radius; i < bars.length - radius; i++) {
    const current = bars[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - radius; j <= i + radius; j++) {
      if (j === i) continue;
      if (bars[j].high >= current.high) isHigh = false;
      if (bars[j].low <= current.low) isLow = false;
    }

    if (isHigh) {
      rawPivots.push({ index: i, bar: current, isHigh: true, price: current.high });
    } else if (isLow) {
      rawPivots.push({ index: i, bar: current, isHigh: false, price: current.low });
    }
  }

  // Lọc xen kẽ đỉnh - đáy liên tiếp (loại bỏ 2 đỉnh hoặc 2 đáy liền nhau bằng cách giữ lại điểm cực trị cao/thấp hơn)
  const alternating: typeof rawPivots = [];
  for (const p of rawPivots) {
    if (alternating.length === 0) {
      alternating.push(p);
    } else {
      const prev = alternating[alternating.length - 1];
      if (prev.isHigh !== p.isHigh) {
        alternating.push(p);
      } else {
        if (p.isHigh && p.price > prev.price) alternating[alternating.length - 1] = p;
        if (!p.isHigh && p.price < prev.price) alternating[alternating.length - 1] = p;
      }
    }
  }

  return alternating;
}

/**
 * Tính toán & Thẩm định cấu trúc Sóng Elliott chuẩn định lượng (6 điểm P0-P5 + ABC)
 */
function computeElliottStructure(priceSeries: OhlcBar[]): ElliottCalculationResult {
  if (priceSeries.length < 25) {
    return { pivots: [], isValidImpulse: false, violations: ['Chưa đủ dữ liệu nến'], isUptrend: true, summary: '' };
  }

  // Khảo sát 80-100 nến gần nhất để bám sát chu kỳ sóng hiện hành
  const windowBars = priceSeries.slice(-90);

  // Thử nghiệm các bán kính swing từ lớn đến nhỏ để tìm bộ swing phù hợp nhất
  let swings = findAlternatingSwings(windowBars, 4);
  if (swings.length < 6) swings = findAlternatingSwings(windowBars, 3);
  if (swings.length < 6) swings = findAlternatingSwings(windowBars, 2);

  if (swings.length < 6) {
    return {
      pivots: swings.map((s, i) => ({
        time: s.bar.time,
        price: s.price,
        label: `W${i + 1}`,
        isHigh: s.isHigh,
      })),
      isValidImpulse: false,
      violations: ['Chưa đủ số điểm xoay để định hình sóng Elliott chuẩn (cần tối thiểu 6 điểm P0-P5).'],
      isUptrend: true,
      summary: 'Đang hình thành cấu trúc swing',
    };
  }

  // Lấy 6 điểm swing gần nhất để kiểm tra cấu trúc 5 sóng đẩy (P0 -> P1 -> P2 -> P3 -> P4 -> P5)
  // Nếu có thêm 2 hoặc 3 điểm sau P5, có thể định hình sóng điều chỉnh ABC
  const totalSwings = swings.length;
  // Xét cụm 6 điểm P0..P5:
  // Nếu totalSwings >= 9 -> có thể là P0..P5 kèm A, B, C
  const hasAbc = totalSwings >= 9;
  const startIndex = hasAbc ? totalSwings - 9 : totalSwings - 6;
  const activeCluster = swings.slice(startIndex);

  const [p0, p1, p2, p3, p4, p5] = activeCluster;
  const isUptrend = p1.price > p0.price; // Nếu p1 > p0: Sóng đẩy tăng; ngược lại: Sóng đẩy giảm

  const violations: string[] = [];

  // ==========================================
  // KIỂM TRA 3 QUY TẮC BẮT BUỘC (CARDINAL RULES)
  // ==========================================

  // Quy tắc 1: Sóng 2 không hồi quá 100% Sóng 1 (không vượt qua P0)
  const rule1Ok = isUptrend ? p2.price > p0.price : p2.price < p0.price;
  if (!rule1Ok) {
    violations.push('Sóng ② hồi quá 100% Sóng ① (thủng điểm xuất phát ⓪)');
  }

  // Quy tắc 2: Sóng 3 không phải là sóng ngắn nhất trong 3 sóng đẩy (1, 3, 5)
  const lenWave1 = Math.abs(p1.price - p0.price);
  const lenWave3 = Math.abs(p3.price - p2.price);
  const lenWave5 = Math.abs(p5.price - p4.price);

  if (lenWave3 < lenWave1 && lenWave3 < lenWave5) {
    violations.push('Sóng ③ ngắn nhất trong 3 sóng đẩy (①, ③, ⑤) — vi phạm quy tắc cơ bản');
  }

  // Quy tắc 3: Sóng 4 không xâm phạm vào vùng giá đỉnh/đáy của Sóng 1
  const rule3Ok = isUptrend ? p4.price > p1.price : p4.price < p1.price;
  if (!rule3Ok) {
    violations.push('Sóng ④ xâm phạm vào vùng giá của Sóng ① (overlap violation)');
  }

  const isValidImpulse = violations.length === 0;

  // ==========================================
  // TÍNH CÁC TỶ LỆ FIBONACCI THƯỜNG GẶP
  // ==========================================
  const fibWave2Retrace = lenWave1 > 0 ? ((Math.abs(p2.price - p1.price) / lenWave1) * 100).toFixed(0) : '';
  const fibWave3Extension = lenWave1 > 0 ? ((lenWave3 / lenWave1) * 100).toFixed(0) : '';
  const fibWave4Retrace = lenWave3 > 0 ? ((Math.abs(p4.price - p3.price) / lenWave3) * 100).toFixed(0) : '';

  // Gắn nhãn chuẩn với ký hiệu số sóng và thông tin Fibonacci
  const pivotsResult: WavePivot[] = [
    {
      time: p0.bar.time,
      price: p0.price,
      label: '⓪ Gốc',
      isHigh: p0.isHigh,
    },
    {
      time: p1.bar.time,
      price: p1.price,
      label: '①',
      isHigh: p1.isHigh,
      fibInfo: `Sóng 1: ${lenWave1.toFixed(1)}đ`,
    },
    {
      time: p2.bar.time,
      price: p2.price,
      label: '②',
      isHigh: p2.isHigh,
      fibInfo: `Hồi ${fibWave2Retrace}% W1`,
    },
    {
      time: p3.bar.time,
      price: p3.price,
      label: '③',
      isHigh: p3.isHigh,
      fibInfo: `Ext ${fibWave3Extension}% W1`,
    },
    {
      time: p4.bar.time,
      price: p4.price,
      label: '④',
      isHigh: p4.isHigh,
      fibInfo: `Hồi ${fibWave4Retrace}% W3`,
    },
    {
      time: p5.bar.time,
      price: p5.price,
      label: '⑤',
      isHigh: p5.isHigh,
    },
  ];

  // Nếu có các điểm sóng điều chỉnh phía sau (A, B, C)
  if (activeCluster.length >= 7) {
    const pA = activeCluster[6];
    pivotsResult.push({
      time: pA.bar.time,
      price: pA.price,
      label: 'Ⓐ',
      isHigh: pA.isHigh,
    });
  }
  if (activeCluster.length >= 8) {
    const pB = activeCluster[7];
    pivotsResult.push({
      time: pB.bar.time,
      price: pB.price,
      label: 'Ⓑ',
      isHigh: pB.isHigh,
    });
  }
  if (activeCluster.length >= 9) {
    const pC = activeCluster[8];
    pivotsResult.push({
      time: pC.bar.time,
      price: pC.price,
      label: 'Ⓒ',
      isHigh: pC.isHigh,
    });
  }

  const summary = isValidImpulse
    ? `Cấu trúc 5 sóng ${isUptrend ? 'tăng' : 'giảm'} hợp lệ (W3: ${fibWave3Extension}% W1, W2: hồi ${fibWave2Retrace}%)`
    : `Cấu trúc sóng có ${violations.length} điểm vi phạm quy tắc Elliott`;

  return {
    pivots: pivotsResult,
    isValidImpulse,
    violations,
    isUptrend,
    summary,
  };
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

