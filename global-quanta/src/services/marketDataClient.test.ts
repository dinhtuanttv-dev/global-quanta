import { getMarketGateway } from '../config/marketGateway';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeFeedStatus, isSsiSource, marketUrl, subscribeMarket, type StreamStatus } from './marketDataClient';

const status = (patch: Partial<StreamStatus>): StreamStatus => ({
  transport: 'connected',
  connected: true,
  session: 'LO',
  live: [],
  stale: [],
  fallback: [],
  closed: [],
  pending: [],
  updatedAt: '2026-10-01T03:00:00Z',
  ...patch,
});

describe('describeFeedStatus', () => {
  it('chỉ báo SSI LIVE khi mọi mã đều có dữ liệu SSI mới', () => {
    expect(describeFeedStatus(status({ live: ['FPT', 'HPG'] })).label).toBe('● SSI LIVE');
    expect(describeFeedStatus(status({ live: ['FPT'], pending: ['HPG'] })).label).not.toBe('● SSI LIVE');
  });

  it('socket đã mở nhưng chưa có tick thì không phải LIVE', () => {
    const badge = describeFeedStatus(status({ transport: 'connected', pending: ['FPT'] }));
    expect(badge.tone).toBe('loading');
  });

  it('báo số mã đang dùng nguồn dự phòng', () => {
    const badge = describeFeedStatus(status({ live: ['FPT'], fallback: ['HPG', 'VNM'] }));
    expect(badge.label).toBe('◐ DỰ PHÒNG 2/3');
    expect(badge.title).toContain('HPG, VNM');
  });

  it('ngoài giờ giao dịch báo ĐÓNG CỬA thay vì OFFLINE', () => {
    expect(describeFeedStatus(status({ session: 'CLOSED', transport: 'down', closed: ['FPT'] })).tone).toBe('closed');
  });

  it('mất kết nối tới máy chủ dữ liệu', () => {
    expect(describeFeedStatus(null, true).tone).toBe('offline');
    expect(describeFeedStatus(null).tone).toBe('loading');
  });
});

describe('marketUrl / isSsiSource', () => {
  it('bỏ tham số rỗng và mã hoá query', () => {
    // Tiền tố = Gateway đang cấu hình (mặc định Gateway production khi không khai báo biến môi trường).
    expect(marketUrl('/api/market/ohlcv', { ticker: 'FPT', range: '3mo', from: undefined, limit: 30 })).toBe(
      `${getMarketGateway().baseUrl}/api/market/ohlcv?ticker=FPT&range=3mo&limit=30`,
    );
  });

  it('nhận diện nguồn SSI', () => {
    expect(isSsiSource('SSI_STREAM')).toBe(true);
    expect(isSsiSource('SSI_FC_V2')).toBe(true);
    expect(isSsiSource('LEGACY')).toBe(false);
  });
});

describe('subscribeMarket', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mở MỘT EventSource cho mọi mã và phân phối quote/status', () => {
    const instances: FakeEventSource[] = [];
    class FakeEventSource {
      url: string;
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
      onerror: (() => void) | null = null;
      closed = false;
      constructor(url: string) {
        this.url = url;
        instances.push(this);
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
    vi.stubGlobal('EventSource', FakeEventSource);

    const quotes: string[] = [];
    const statuses: string[] = [];
    const symbols = Array.from({ length: 120 }, (_, i) => `M${i}`);
    const stop = subscribeMarket({
      symbols: [...symbols, 'm0'],
      indices: ['vnindex'],
      onQuote: (q) => quotes.push(q.symbol),
      onStatus: (s) => statuses.push(s.transport),
    });
    expect(instances).toHaveLength(1);
    const url = new URL(instances[0].url, 'http://x');
    expect(url.searchParams.get('symbols')!.split(',')).toHaveLength(120);
    expect(url.searchParams.get('indices')).toBe('VNINDEX');

    instances[0].emit('quote', { symbol: 'FPT', price: 1 });
    instances[0].emit('status', { transport: 'connected' });
    instances[0].emit('quote', 'not-json-object');
    expect(quotes).toEqual(['FPT', undefined]);
    expect(statuses).toEqual(['connected']);

    stop();
    expect(instances[0].closed).toBe(true);
  });
});
