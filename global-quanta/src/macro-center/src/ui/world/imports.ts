import { StockProfile, WorldScenario } from './ScenarioStock';

/** Indirection kept so WorldTab imports a single object (easier to mock in tests). */
export const ScenarioStockImports = { StockProfile, WorldScenario };
