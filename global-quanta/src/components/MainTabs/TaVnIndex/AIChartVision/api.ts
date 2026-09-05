/**
 * API client for AI Chart Vision
 * Endpoint: POST /api/scan -> backend/src/routes/scan.js
 */

import type { ScanParams, ScanResult } from "./types";

const API_BASE = "http://localhost:4000";

/**
 * Run scan on multiple timeframes using AI vision model
 * Returns full ScanResult with macro_layer, tactical_layer, quant_layer,
 * consensus_verdict, risk_management, ai_synthesis
 */
export async function runScan(params: ScanParams): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: params.symbol,
      timeframes: params.timeframes,
      ai_model: params.aiModel,
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
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}