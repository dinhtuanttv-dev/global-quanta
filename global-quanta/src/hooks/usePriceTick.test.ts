import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPriceSimulationEnabled } from './usePriceTick';

describe('isPriceSimulationEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('tắt giá mô phỏng khi bật Market Gateway (chỉ hiển thị giá thật)', () => {
    vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'true');
    expect(isPriceSimulationEnabled()).toBe(false);
  });

  it('giữ hành vi cũ khi chưa bật Gateway', () => {
    vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'false');
    expect(isPriceSimulationEnabled()).toBe(true);
  });
});
