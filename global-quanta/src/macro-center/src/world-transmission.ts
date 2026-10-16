/**
 * world-transmission.ts — turn a company's reported exposures into channel exposures and rank stocks
 * under a channel shock. Everything here is derived from reported facts and fixed loadings, NOT
 * estimated from returns, so every result is a hypothesis (tier C) until validated statistically.
 */
import type { Channel, StockExposure } from './world-types';

export const ALL_CHANNELS: Channel[] = ['commodity', 'fx_rates', 'capital_flow', 'export_demand', 'risk_sentiment', 'policy_trade'];

/** Per-channel exposure, each roughly in [−1, 1]. */
export function channelExposure(x: StockExposure): Record<Channel, number> {
  const rev = x.revenueByRegion;
  const foreign = Object.entries(rev).filter(([r]) => r !== 'VN').reduce((s, [, v]) => s + (v ?? 0), 0) / 100;
  return {
    commodity: x.commodityCostShare,
    fx_rates: x.fxRevenueShare - x.fxDebtShare,
    capital_flow: x.foreignOwnership ?? 0,
    export_demand: foreign,
    risk_sentiment: x.foreignOwnership ?? 0,
    policy_trade: (rev.US ?? 0) / 100,
  };
}

/** Expected sign of each channel's effect on a unit of exposure when the channel shock is +1. */
export const DEFAULT_LOADINGS: Record<Channel, number> = {
  commodity: -1, // higher input prices hurt a commodity-cost-heavy firm
  fx_rates: 1, // stronger USD helps net foreign-currency earners
  capital_flow: 1,
  export_demand: 1,
  risk_sentiment: -1,
  policy_trade: -1, // more trade-policy uncertainty hurts exposed exporters
};

export interface StockScenarioEffect {
  code: string;
  score: number;
  byChannel: Partial<Record<Channel, number>>;
  /** always 'C': derived from exposures, not estimated */
  tier: 'C';
}

export function scenarioEffect(x: StockExposure, shocks: Partial<Record<Channel, number>>, loadings: Record<Channel, number> = DEFAULT_LOADINGS): StockScenarioEffect {
  const exp = channelExposure(x);
  const byChannel: Partial<Record<Channel, number>> = {};
  let score = 0;
  for (const c of ALL_CHANNELS) {
    const s = shocks[c];
    if (s === undefined) continue;
    const v = exp[c] * loadings[c] * s;
    byChannel[c] = v;
    score += v;
  }
  return { code: x.code, score, byChannel, tier: 'C' };
}

export function rankStocks(stocks: StockExposure[], shocks: Partial<Record<Channel, number>>, loadings?: Record<Channel, number>): StockScenarioEffect[] {
  return stocks.map((s) => scenarioEffect(s, shocks, loadings)).sort((a, b) => a.score - b.score);
}
