import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Project A (API cổ tức, Elite 10, Siêu Quét cũ…) — mặc định cho bản BUILD khi dự án deploy chưa khai báo VITE_API_BASE_URL. */
const DEFAULT_API_BASE_URL = 'https://tuan-quant-scanner-psi.vercel.app';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Chỉ áp cho `vite build`: dev cục bộ vẫn dùng proxy /api -> localhost:4000 khi để trống. Tránh lặp lại sự cố 10/2026
  // (dự án Vercel thiếu biến môi trường -> mất tính năng trên máy người dùng). Gateway mặc định: src/config/marketGateway.ts.
  const apiBaseDefault = command === 'build' && !env.VITE_API_BASE_URL
    ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(DEFAULT_API_BASE_URL) }
    : {};
  return {
    plugins: [react()],
    define: apiBaseDefault,
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
