import type { Tang1ApiResponse, Scenario } from "../types/tang1";

const API_BASE = "https://tuan-quant-scanner-9lwpafmq-dinhtuanttv-devs-projects.vercel.app";

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  const res = await fetch(`${API_BASE}/api/tang1?scenario=${scenario}`);
  if (!res.ok) throw new Error(`Tang1 API loi: ${res.status}`);
  return res.json();
}