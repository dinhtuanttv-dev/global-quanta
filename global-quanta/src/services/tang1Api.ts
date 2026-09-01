import type { Tang1ApiResponse, Scenario } from "../types/tang1";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  try {
    const url = `${API_BASE}/api/tang1?scenario=${scenario}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: Tang1ApiResponse = await response.json();
    return data;
  } catch (error) {
    console.error("[tang1Api] Error:", error);
    throw error;
  }
}
