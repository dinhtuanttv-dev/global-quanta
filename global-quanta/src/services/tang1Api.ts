import type { Tang1ApiResponse, Scenario } from "../types/tang1";

const API_BASE = "https://tuan-quant-scanner-9lwpafmq-dinhtuanttv-devs-projects.vercel.app";

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
  ],
};

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  console.log("[tang1Api] USING MOCK DATA for scenario:", scenario);
  return { ...MOCK_TANG1_DATA, scenario };
}// CORS-FIX: v11.0 - Force mock data for production
