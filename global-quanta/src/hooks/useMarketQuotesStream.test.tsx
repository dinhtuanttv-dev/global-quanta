import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketQuotesStream } from './useMarketQuotesStream';

class FakeEventSource {
  static last: FakeEventSource;
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {
    this.closed = true;
  }
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useMarketQuotesStream', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('gộp tick theo chu kỳ và trả giá SSI cho bảng', () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'true');
    vi.stubGlobal('EventSource', FakeEventSource);
    let result: ReturnType<typeof useMarketQuotesStream> | undefined;
    function Probe() {
      result = useMarketQuotesStream(['fpt', 'HPG', 'FPT'], 1000);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(new URL(FakeEventSource.last.url, 'http://x').searchParams.get('symbols')).toBe('FPT,HPG');

    act(() => {
      FakeEventSource.last.emit('quote', { symbol: 'FPT', price: 62700, changePct: -0.48, provenance: { source: 'SSI_STREAM', asOf: 't1' } });
      FakeEventSource.last.emit('quote', { symbol: 'FPT', price: 62800, changePct: -0.32, provenance: { source: 'SSI_STREAM', asOf: 't2' } });
    });
    expect(result!.quotes).toEqual({}); // chưa tới chu kỳ cập nhật
    act(() => vi.advanceTimersByTime(1000));
    expect(result!.quotes.FPT).toEqual({ price: 62800, changePct: -0.32, source: 'SSI_STREAM', asOf: 't2' });

    act(() => root.unmount());
    expect(FakeEventSource.last.closed).toBe(true);
  });

  it('không mở kết nối khi chưa bật Gateway', () => {
    vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'false');
    const ctor = vi.fn();
    vi.stubGlobal('EventSource', ctor);
    function Probe() {
      useMarketQuotesStream(['FPT']);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(ctor).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
