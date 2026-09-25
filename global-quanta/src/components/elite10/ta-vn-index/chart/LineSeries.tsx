import type { ISeriesApi, LineData, LineStyle, WhitespaceData } from 'lightweight-charts';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { useChartContext } from './ChartContainer';

export interface LineSeriesOptions {
  color?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: LineStyle;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
}

/**
 * Giai doan 2/5: component con Line GENERIC - dung CHUNG cho SMA200,
 * EMA100/50/21, Bollinger Upper/Lower, Trendline, va 3 duong fan
 * chart MS-GARCH (p10/p50/p90) - thay vi 8+ doan code addLineSeries
 * rieng le nhu MainChart.tsx cu, gio chi 1 component tai su dung
 * nhieu lan voi props khac nhau.
 *
 * options CHI ap dung 1 LAN khi tao series (khong doi dong - cac
 * duong nay co mau/kieu co dinh trong suot vong doi), CHI "data" la
 * props thay doi dong (setData moi khi props.data doi).
 */
export const LineSeries = forwardRef<ISeriesApi<'Line'>, { data: (LineData | WhitespaceData)[]; options?: LineSeriesOptions }>((props, ref) => {
  const parent = useChartContext();
  const optionsRef = useRef(props.options);
  const context = useRef<{ _api?: ISeriesApi<'Line'>; api(): ISeriesApi<'Line'>; free(): void }>({
    api() {
      if (!this._api) {
        this._api = parent.api().addLineSeries({
          lastValueVisible: false, priceLineVisible: false,
          ...optionsRef.current,
        });
      }
      return this._api;
    },
    free() {
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
      currentRef.api().setData(props.data);
    } catch { /* chart da dispose, bo qua an toan */ }
  }, [props.data]);

  useImperativeHandle(ref, () => context.current.api(), []);

  return null;
});
LineSeries.displayName = 'LineSeries';
