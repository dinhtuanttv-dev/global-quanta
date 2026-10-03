import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Môi trường test mặc định KHÔNG có Market Gateway (ứng dụng thật mặc định BẬT); test cần Gateway tự vi.stubEnv(..., 'true').
    env: { VITE_MARKET_GATEWAY_ENABLED: 'false' },
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules', 'dist', '.git', 'cypress', 'backend/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.setup.ts',
        '*.config.ts',
        '__tests__/fixtures/**',
      ],
    },
  },
});