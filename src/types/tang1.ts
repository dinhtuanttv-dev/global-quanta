export type Scenario = "growth" | "cautious" | "defensive";

export interface Tang1Stock {
  ticker: string;
  sector: string;
  epsGrowth: number;
  faScore: number;
  tang1Score: number;
}

export interface Tang1ScenarioStock extends Tang1Stock {
  scenarioScore: number;
}

export interface Tang1ApiResponse {
  tang1Result: Tang1Stock[];
  tang1WithScenario: Tang1ScenarioStock[];
  scenario: Scenario;
  universeSize: number;
}
