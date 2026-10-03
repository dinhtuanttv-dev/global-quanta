import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKET_GATEWAY_URL, resolveMarketGatewayConfig } from './marketGateway';

describe('cấu hình Market Gateway', () => {
  it('thiếu biến môi trường -> BẬT, Gateway production, bảng quét từ Gateway (sự cố global-quanta.vercel.app)', () => {
    expect(resolveMarketGatewayConfig({})).toEqual({ enabled: true, baseUrl: DEFAULT_MARKET_GATEWAY_URL, scannerSource: 'gateway' });
  });
  it('chỉ tắt khi đặt rõ false; URL riêng được tôn trọng', () => {
    expect(resolveMarketGatewayConfig({ VITE_MARKET_GATEWAY_ENABLED: 'false' })).toMatchObject({ enabled: false, scannerSource: 'projectA' });
    expect(resolveMarketGatewayConfig({ VITE_MARKET_API_BASE_URL: 'https://gw.example.com/' }).baseUrl).toBe('https://gw.example.com');
    expect(resolveMarketGatewayConfig({ VITE_SCANNER_SOURCE: 'projectA' }).scannerSource).toBe('projectA');
  });
});
