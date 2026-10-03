import { describe, expect, it } from 'vitest';
import real from '../../../../lib/cotuc/__fixtures__/decision-states.real.json';
import type { DecisionSnapshot } from '../../../../lib/cotuc/decision';
import { rankDecisions } from './DecisionRanking';

describe('rankDecisions', () => {
  it('Thuận lợi > Quan sát > Chưa nên, rồi xác suất tổng hợp (dữ liệu thật REE/MWG/FPT)', () => {
    const states = (real as { states: DecisionSnapshot[] }).states;
    const ranked = rankDecisions(states);
    const order = { FAVORABLE: 0, WATCH: 1, AVOID: 2 };
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1], b = ranked[i];
      expect(order[a.decision.level] < order[b.decision.level]
        || (a.decision.level === b.decision.level && a.decision.combinedProbability >= b.decision.combinedProbability)).toBe(true);
    }
    expect(ranked[0].ticker).toBe('REE'); // WATCH duy nhất
  });
});
