import type { ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';
import React, { createContext, forwardRef, useContext, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';

/**
 * MO RONG (Giai doan 4): SeriesContext RIENG (khac ChartContext) - cho
 * phep cac component CON cua CandlestickSeries (Price Lines, Zone) tu
 * kiem tra "isRemoved" CUA CHINH SERIES NAY (khong chi cua chart), dam
 * bao dung thu tu cleanup theo CAY (Price Lines don TRUOC Candlestick
 * series, Candlestick don TRUOC Chart) - giai quyet DUNG goc re bug cu
 * cho ca cac tinh nang gan lien voi 1 series cu the (khong phai chi
 * chart-level).
 */
export interface SeriesApiRef {
  isRemoved: boolean;
  api(): ISeriesApi<'Candlestick'>;
}
const SeriesContext = createContext<SeriesApiRef | null>(null);
export function useCandlestickSeriesContext(): SeriesApiRef {
  const ctx = useContext(SeriesContext);
  if (!ctx) throw new Error('useCandlestickSeriesContext phai duoc dung ben trong <CandlestickSeries>');
  return ctx;
}

/**
 * Giai doan 1/5 (+ mo rong Giai doan 3+4): component con Candlestick,
 * theo dung pattern chinh thuc - moi Series la 1 component RIENG, tu
 * quan ly lifecycle (add/setData/remove), khong con gop chung vao 1
 * "sieu useEffect" nhu MainChart.tsx cu.
 *
 * MO RONG (Giai doan 3): them prop "markers" (su kien T/A/C + canh bao
 * risk flag + Triple-Barrier Lop 1) - markers GAN LIEN VOI candlestick
 * series cu the (setMarkers() la method CUA series, khong phai chart),
 * nen giu trong CUNG component thay vi tach rieng.
 *
 * MO RONG (Giai doan 4): nhan children (TradeScenarioLines,
 * TripleBarrierZone) thay vi return null - cac con nay dung
 * useCandlestickSeriesContext() de truy cap series + kiem tra isRemoved
 * CUA CHINH SERIES nay truoc khi goi createPriceLine/removePriceLine.
 */
export const CandlestickSeries = forwardRef<ISeriesApi<'Candlestick'>, { data: OhlcBar[]; markers?: SeriesMarker<Time>[]; children?: React.ReactNode }>((props, ref) => {
  const parent = useChartContext();
  const context = useRef<SeriesApiRef & { _api?: ISeriesApi<'Candlestick'>; free(): void }>({
    isRemoved: false,
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
    return () => {
      // Danh dau isRemoved=true TRUOC khi free() - cac con (Price
      // Lines/Zone) cleanup SAU (dung thu tu cay component) se thay
      // flag nay va KHONG con goi createPriceLine/removePriceLine nua.
      currentRef.isRemoved = true;
      currentRef.free();
    };
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

  return <SeriesContext.Provider value={context.current}>{props.children}</SeriesContext.Provider>;
});
CandlestickSeries.displayName = 'CandlestickSeries';
