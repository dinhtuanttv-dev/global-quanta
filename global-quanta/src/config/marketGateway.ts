// Cấu hình Market Gateway DUY NHẤT cho giao diện.
// Mặc định BẬT và trỏ tới Gateway production — mọi bản deploy (kể cả dự án Vercel mới / tên miền mới chưa khai báo biến môi
// trường) đều có đủ tính năng: giá SSI trực tiếp, Radar đủ nguồn, tin tức, danh mục ngoài universe. Sự cố 10/2026:
// dự án Vercel "global-quanta" thiếu VITE_MARKET_* nên tắt toàn bộ phần dùng Gateway trên điện thoại người dùng.
// Chỉ tắt khi đặt RÕ VITE_MARKET_GATEWAY_ENABLED=false (VD môi trường thử nghiệm không có Gateway).

export const DEFAULT_MARKET_GATEWAY_URL = 'https://gateway-production-1da0.up.railway.app';

type Env = Record<string, string | boolean | undefined>;

export interface MarketGatewayConfig {
  enabled: boolean;
  baseUrl: string;
  /** Nguồn bảng Siêu Quét: engine trên Gateway (SSI) hoặc Project A (cũ). */
  scannerSource: 'gateway' | 'projectA';
}

export function resolveMarketGatewayConfig(env: Env): MarketGatewayConfig {
  const flag = String(env.VITE_MARKET_GATEWAY_ENABLED ?? '').trim().toLowerCase();
  const enabled = flag !== 'false' && flag !== '0';
  const baseUrl = String(env.VITE_MARKET_API_BASE_URL || DEFAULT_MARKET_GATEWAY_URL).trim().replace(/\/+$/, '');
  const src = String(env.VITE_SCANNER_SOURCE ?? '').trim().toLowerCase();
  return { enabled, baseUrl, scannerSource: enabled && src !== 'projecta' ? 'gateway' : 'projectA' };
}

/** Cấu hình hiện hành — đọc import.meta.env MỖI LẦN gọi (test có thể vi.stubEnv giữa chừng). */
export function getMarketGateway(): MarketGatewayConfig {
  return resolveMarketGatewayConfig(import.meta.env as unknown as Env);
}
