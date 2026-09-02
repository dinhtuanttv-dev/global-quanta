import type { Tang1ApiResponse, Scenario } from "../types/tang1";

/**
 * Base URL of the quant-macro-scanner backend.
 *
 * - LOCAL DEV: leave VITE_API_BASE_URL empty so Vite proxies relative
 *   `/api/...` requests to http://localhost:3000 (see vite.config.ts).
 *   The proxy makes the calls same-origin, which avoids CORS errors because
 *   the backend routes only send Access-Control-Allow-Origin on /api/tang1.
 *
 * - PRODUCTION: VITE_API_BASE_URL is set to the deployed backend URL
 *   (https://tuan-quant-scanner-psi.vercel.app) via the platform env vars.
 *
 * NOTE: previously this file hard-coded
 *   "https://tuan-quant-scanner-9lwpafmq-dinhtuanttv-devs-projects.vercel.app"
 * which returned HTTP 404 for /api/tang1 — that is why the Siêu Quét AI tab
 * could not load Tang1 data.
 */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  "https://tuan-quant-scanner-psi.vercel.app";

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  const url = `${API_BASE}/api/tang1?scenario=${scenario}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Tang1 API loi: ${res.status} ${res.statusText}${
        errorData?.error ? ` - ${errorData.error}` : ""
      }`
    );
  }

  const data: Tang1ApiResponse = await res.json();
  return data;
}