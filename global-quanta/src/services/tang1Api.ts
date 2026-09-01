import type { Tang1ApiResponse, Scenario } from "../types/tang1";

const FORCE_MOCK_DATA = true;

const MOCK_TANG1_DATA: Tang1ApiResponse = {
  scenario: "growth",
  universeSize: 50,
  tang1Result: [
    { ticker: "FPT", sector: "Technology", epsGrowth: 24.5, faScore: 92, tang1Score: 85.2 },
    { ticker: "MWG", sector: "Retail", epsGrowth: 18.2, faScore: 88, tang1Score: 82.1 },
    { ticker: "VCB", sector: "Banking", epsGrowth: 15.8, faScore: 90, tang1Score: 79.5 },
    { ticker: "VHM", sector: "Real Estate", epsGrowth: 12.3, faScore: 85, tang1Score: 76.8 },
    { ticker: "VNM", sector: "Consumer", epsGrowth: 8.5, faScore: 87, tang1Score: 74.2 },
    { ticker: "MSN", sector: "Consumer", epsGrowth: 22.1, faScore: 89, tang1Score: 81.5 },
    { ticker: "SSI", sector: "Securities", epsGrowth: 35.2, faScore: 82, tang1Score: 78.9 },
    { ticker: "HPG", sector: "Steel", epsGrowth: 16.7, faScore: 84, tang1Score: 75.3 },
    { ticker: "CTG", sector: "Banking", epsGrowth: 14.2, faScore: 86, tang1Score: 73.6 },
    { ticker: "BID", sector: "Banking", epsGrowth: 11.8, faScore: 83, tang1Score: 71.2 },
    { ticker: "TCB", sector: "Banking", epsGrowth: 19.5, faScore: 88, tang1Score: 77.8 },
    { ticker: "MBB", sector: "Banking", epsGrowth: 21.3, faScore: 85, tang1Score: 76.4 },
    { ticker: "ACB", sector: "Banking", epsGrowth: 17.9, faScore: 87, tang1Score: 75.8 },
    { ticker: "STB", sector: "Banking", epsGrowth: 25.4, faScore: 81, tang1Score: 74.1 },
    { ticker: "PNJ", sector: "Retail", epsGrowth: 13.6, faScore: 86, tang1Score: 72.5 },
    { ticker: "DGW", sector: "Retail", epsGrowth: 18.8, faScore: 84, tang1Score: 71.8 },
    { ticker: "VRE", sector: "Real Estate", epsGrowth: 9.2, faScore: 82, tang1Score: 68.5 },
    { ticker: "KDH", sector: "Real Estate", epsGrowth: 11.5, faScore: 85, tang1Score: 70.8 },
    { ticker: "NLG", sector: "Real Estate", epsGrowth: 14.3, faScore: 80, tang1Score: 67.2 },
    { ticker: "PLX", sector: "Oil & Gas", epsGrowth: 10.5, faScore: 78, tang1Score: 65.4 },
  ],
  tang1WithScenario: [
    { ticker: "FPT", sector: "Technology", epsGrowth: 24.5, faScore: 92, tang1Score: 85.2, scenarioScore: 92 },
    { ticker: "MWG", sector: "Retail", epsGrowth: 18.2, faScore: 88, tang1Score: 82.1, scenarioScore: 88 },
    { ticker: "VCB", sector: "Banking", epsGrowth: 15.8, faScore: 90, tang1Score: 79.5, scenarioScore: 78 },
    { ticker: "VHM", sector: "Real Estate", epsGrowth: 12.3, faScore: 85, tang1Score: 76.8, scenarioScore: 65 },
    { ticker: "VNM", sector: "Consumer", epsGrowth: 8.5, faScore: 87, tang1Score: 74.2, scenarioScore: 72 },
    { ticker: "MSN", sector: "Consumer", epsGrowth: 22.1, faScore: 89, tang1Score: 81.5, scenarioScore: 85 },
    { ticker: "SSI", sector: "Securities", epsGrowth: 35.2, faScore: 82, tang1Score: 78.9, scenarioScore: 80 },
    { ticker: "HPG", sector: "Steel", epsGrowth: 16.7, faScore: 84, tang1Score: 75.3, scenarioScore: 70 },
    { ticker: "CTG", sector: "Banking", epsGrowth: 14.2, faScore: 86, tang1Score: 73.6, scenarioScore: 68 },
    { ticker: "BID", sector: "Banking", epsGrowth: 11.8, faScore: 83, tang1Score: 71.2, scenarioScore: 62 },
    { ticker: "TCB", sector: "Banking", epsGrowth: 19.5, faScore: 88, tang1Score: 77.8, scenarioScore: 75 },
    { ticker: "MBB", sector: "Banking", epsGrowth: 21.3, faScore: 85, tang1Score: 76.4, scenarioScore: 73 },
    { ticker: "ACB", sector: "Banking", epsGrowth: 17.9, faScore: 87, tang1Score: 75.8, scenarioScore: 71 },
    { ticker: "STB", sector: "Banking", epsGrowth: 25.4, faScore: 81, tang1Score: 74.1, scenarioScore: 76 },
    { ticker: "PNJ", sector: "Retail", epsGrowth: 13.6, faScore: 86, tang1Score: 72.5, scenarioScore: 68 },
    { ticker: "DGW", sector: "Retail", epsGrowth: 18.8, faScore: 84, tang1Score: 71.8, scenarioScore: 70 },
    { ticker: "VRE", sector: "Real Estate", epsGrowth: 9.2, faScore: 82, tang1Score: 68.5, scenarioScore: 55 },
    { ticker: "KDH", sector: "Real Estate", epsGrowth: 11.5, faScore: 85, tang1Score: 70.8, scenarioScore: 60 },
    { ticker: "NLG", sector: "Real Estate", epsGrowth: 14.3, faScore: 80, tang1Score: 67.2, scenarioScore: 58 },
    { ticker: "PLX", sector: "Oil & Gas", epsGrowth: 10.5, faScore: 78, tang1Score: 65.4, scenarioScore: 52 },
  ],
};

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  console.log("[tang1Api] USING MOCK DATA for scenario:", scenario);
  return { ...MOCK_TANG1_DATA, scenario };
}