import type { ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';

/**
 * Giai doan 1/5 (+ mo rong Giai doan 3): component con Candlestick,
 * theo dung pattern chinh thuc - moi Series la 1 component RIENG, tu
 * quan ly lifecycle (add/setData/remove), khong con gop chung vao 1
 * "sieu useEffect" nhu MainChart.tsx cu.
 *
 * MO RONG (Giai doan 3): them prop "markers" (su kien T/A/C + canh bao
 * risk flag + Triple-Barrier Lop 1) - markers GAN LIEN VOI candlestick
 * series cu the (setMarkers() la method CUA series, khong phai chart),
 * nen giu trong CUNG component thay vi tach rieng.
 */
export const CandlestickSeries = forwardRef<ISeriesApi<'Candlestick'>, { data: OhlcBar[]; markers?: SeriesMarker<Time>[] }>((props, ref) => {
  const parent = useChartContext();
  const context = useRef<{ _api?: ISeriesApi<'Candlestick'>; api(): ISeriesApi<'Candlestick'>; free(): void }>({
    api() {
      if (!this._api) {
        this._api = parent.api().addCandlestickSeries({
          upColor: '#1fe08a', downColor: '#ff4d5e', borderVisible: false,
          wickUpColor: '#1fe08a', wickDownColor: '#ff4d5e',
        });
      }
      return this._api;
    },
    free() {
      // CHI go series NEU parent (chart) CHUA bi remove - day la diem
      // mau chot giai quyet dung nguyen nhan goc cua bug cu.
      if (this._api && !parent.isRemoved) parent.free(this._api);
    },
  });

  useLayoutEffect(() => {
    const currentRef = context.current;
    currentRef.api();
    return () => currentRef.free();
  }, []);

  useLayoutEffect(() => {
    const currentRef = context.current;
    try {
      currentRef.api().setData(
        props.data.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
      );
    } catch { /* chart da dispose, bo qua an toan */ }
  }, [props.data]);

  useLayoutEffect(() => {
    const currentRef = context.current;
    try {
      currentRef.api().setMarkers(props.markers ?? []);
    } catch { /* chart da dispose, bo qua an toan */ }
  }, [props.markers]);

  useImperativeHandle(ref, () => context.current.api(), []);

  return null;
});
CandlestickSeries.displayName = 'CandlestickSeries';
