/**
 * API client for AI Chart Vision
 * Endpoint: POST /api/scan -> api/scan.js (Vercel Serverless Function,
 * cùng project/domain với frontend — KHÔNG cần CORS)
 *
 * ĐÃ SỬA: trước đây hardcode "http://localhost:4000" — chỉ hoạt động khi
 * chạy local, hoàn toàn không kết nối được khi trang đã deploy công khai
 * (đã tự gặp lỗi thật: "Failed to fetch" + CORS error trên
 * global-quanta.vercel.app). Giờ dùng đường dẫn tương đối ("" = same-origin)
 * — hoạt động đúng cả khi chạy local (Vite dev server proxy, nếu có cấu
 * hình) lẫn khi đã deploy (cùng domain thật).
 */

import type { ScanParams, ScanResult } from "./types";

const API_BASE = ""; // same-origin — không hardcode domain nào cả

/**
 * Run scan (chế độ structured — mặc định, nhanh, dữ liệu số thật).
 * Chế độ "vision" (Playwright) KHÔNG được deploy công khai — chỉ chạy được
 * ở backend cục bộ (global-quanta/backend), không gọi được từ bản đã deploy.
 */
export async function runScan(params: ScanParams): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: params.symbol,
      timeframes: params.timeframes,
      mode: "structured", // cố định — vision mode không khả dụng trên bản deploy
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Lỗi server: ${res.status}`);
  }

  return res.json();
}

/**
 * Health check endpoint
 */
export async function checkHealth(): Promise<{
  status: string;
  mock_mode: boolean;
  time: string;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
