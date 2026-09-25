import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import { createChart } from 'lightweight-charts';
import React, {
  createContext, forwardRef, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';

/**
 * KIEN TRUC MOI (Giai doan 1/5, ra soat trietde bug "Object is
 * disposed"): theo DUNG kien truc chinh thuc TradingView de xuat
 * (tradingview.github.io/lightweight-charts/tutorials/react/advanced),
 * dieu chinh tu API v5 (mau chinh thuc) sang API v4.2.3 (dang dung
 * trong du an: addCandlestickSeries/addLineSeries thay vi addSeries).
 *
 * DIEM MAU CHOT giai quyet dung nguyen nhan goc: moi Series con TU
 * KIEM TRA "parent.isRemoved" TRUOC KHI goi removeSeries() - khong con
 * mu quang goi API tren object co the da bi dispose. Dung
 * useLayoutEffect (khong phai useEffect) de dam bao dung thu tu
 * cleanup theo CAY COMPONENT (con luon don dep TRUOC cha khi ca cay
 * unmount cung luc) - day la co che React DAM BAO CHUAN, khac voi
 * nhieu useEffect SIBLING trong CUNG 1 component (thu tu cleanup:
 * top-down, gay ra bug cu).
 */

export interface ChartApiRef {
  isRemoved: boolean;
  container: HTMLDivElement;
  api(): IChartApi;
  free(series: ISeriesApi<SeriesType> | null | undefined): void;
}

export const ChartContext = createContext<ChartApiRef | null>(null);

export function useChartContext(): ChartApiRef {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error('useChartContext phai duoc dung ben trong <ChartWrapper>');
  return ctx;
}

interface ChartWrapperProps {
  children?: React.ReactNode;
  height?: number;
}

/** Component cong khai duy nhat can dung tu ben ngoai - tao container
 * DOM roi moi khoi tao ChartContainer (can container ton tai TRUOC khi
 * goi createChart, dung pattern callback ref + state giong mau chinh
 * thuc). */
export const ChartWrapper = forwardRef<IChartApi, ChartWrapperProps>((props, ref) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const handleRef = useCallback((node: HTMLDivElement | null) => setContainer(node), []);
  return (
    <div ref={handleRef} className="relative w-full" style={{ height: props.height ?? 560 }}>
      {container && (
        <ChartContainerInner height={props.height} container={container} ref={ref}>
          {props.children}
        </ChartContainerInner>
      )}
    </div>
  );
});
ChartWrapper.displayName = 'ChartWrapper';

const ChartContainerInner = forwardRef<IChartApi, { children?: React.ReactNode; height?: number; container: HTMLDivElement }>((props, ref) => {
  const { children, container, height } = props;

  const chartApiRef = useRef<ChartApiRef & { _api?: IChartApi }>({
    isRemoved: false,
    container,
    api() {
      if (!this._api) {
        this._api = createChart(container, {
          height: height ?? 560,
          width: container.clientWidth,
          layout: { background: { color: 'transparent' }, textColor: '#6f8ea3', fontSize: 10 },
          grid: {
            vertLines: { color: 'rgba(255,255,255,0.05)' },
            horzLines: { color: 'rgba(255,255,255,0.05)' },
          },
          rightPriceScale: { borderColor: 'rgba(34,232,255,0.2)' },
          timeScale: { borderColor: 'rgba(34,232,255,0.2)', rightOffset: 5 },
        });
      }
      return this._api;
    },
    free(series) {
      // FIX GOC (bug "Object is disposed"): CHI go series neu chart CHUA
      // bi remove - series con tu kiem tra qua ham nay, khong con mu
      // quang goi removeSeries() tren chart da dispose.
      if (this._api && series && !this.isRemoved) {
        try { this._api.removeSeries(series); } catch { /* da dispose, bo qua an toan */ }
      }
    },
  });

  useLayoutEffect(() => {
    const currentRef = chartApiRef.current;
    const chart = currentRef.api();

    const handleResize = () => {
      try {
        if (!currentRef.isRemoved) chart.applyOptions({ width: container.clientWidth });
      } catch { /* da dispose, bo qua an toan */ }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      // QUAN TRONG: danh dau isRemoved=true TRUOC khi goi chart.remove() -
      // cac Series con (cleanup chay SAU, dung thu tu cay component) se
      // thay flag nay va KHONG con goi removeSeries() nua.
      currentRef.isRemoved = true;
      try { chart.remove(); } catch { /* an toan */ }
    };
  }, [container, height]);

  useImperativeHandle(ref, () => chartApiRef.current.api(), []);

  return <ChartContext.Provider value={chartApiRef.current}>{children}</ChartContext.Provider>;
});
ChartContainerInner.displayName = 'ChartContainerInner';
