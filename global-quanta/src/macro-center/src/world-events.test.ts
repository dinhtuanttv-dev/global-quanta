import { describe, it, expect } from 'vitest';
import { alignEventToSession, bmpTest, eventStudy, flagLimitDays } from './world-events';
import { mulberry32, randn } from './quant-macro';

// 2024-03-04 is a Monday
const days = ['2024-03-04', '2024-03-05', '2024-03-06', '2024-03-07', '2024-03-08', '2024-03-11', '2024-03-12'];

describe('session alignment (Vietnam = UTC+7, close 15:00)', () => {
  it('before the close → same session', () => {
    const r = alignEventToSession('2024-03-05T04:00:00Z', days)!; // 11:00 ICT
    expect(r).toEqual({ index: 1, date: '2024-03-05', sameDay: true });
  });
  it('after the close → next session', () => {
    const r = alignEventToSession('2024-03-05T09:30:00Z', days)!; // 16:30 ICT
    expect(r.date).toBe('2024-03-06');
    expect(r.sameDay).toBe(false);
  });
  it('US evening news (UTC) lands in the Vietnamese date after it', () => {
    const r = alignEventToSession('2024-03-05T19:00:00Z', days)!; // 02:00 ICT on 03-06
    expect(r.date).toBe('2024-03-06');
    expect(r.sameDay).toBe(true);
  });
  it('weekend and holiday gaps roll to the next trading session', () => {
    expect(alignEventToSession('2024-03-09T05:00:00Z', days)!.date).toBe('2024-03-11'); // Saturday
    const holiday = days.filter((d) => d !== '2024-03-06');
    expect(alignEventToSession('2024-03-06T03:00:00Z', holiday)!.date).toBe('2024-03-07');
  });
  it('beyond the calendar or invalid input → null', () => {
    expect(alignEventToSession('2024-03-12T09:00:00Z', days)).toBe(null);
    expect(alignEventToSession('not a date', days)).toBe(null);
  });
  it('flags price-limit sessions', () => {
    expect(flagLimitDays([1, 6.97, -7, 7.2, -6.5])).toEqual([false, true, true, true, false]);
  });
});

function simulate(seed: number, abnormal: Record<number, number> = {}, n = 400, evt = 300) {
  const rng = mulberry32(seed);
  const m = Array.from({ length: n }, () => randn(rng));
  const r = m.map((v, t) => 0.05 + 1.1 * v + 1.2 * randn(rng) + (abnormal[t - evt] ?? 0));
  return { m, r, evt };
}

describe('event study', () => {
  it('estimates the market model and detects an injected abnormal return', () => {
    const { m, r, evt } = simulate(1, { 0: 6, 1: 2 });
    const res = eventStudy(r, m, evt)!;
    expect(Math.abs(res.beta - 1.1)).toBeLessThan(0.2);
    expect(res.nEst).toBe(221);
    expect(res.car).toBeGreaterThan(5);
    expect(res.t).toBeGreaterThan(1.97);
    expect(res.p).toBeLessThan(0.05);
    expect(res.path).toHaveLength(16);
    expect(res.path[0].car).toBe(null);
    const day0 = res.path.find((p) => p.day === 0)!;
    expect(day0.ar).toBeGreaterThan(3);
  });
  it('is correctly sized under the null (5% test rejects 2-9% of the time)', () => {
    let rej = 0;
    const N = 500;
    for (let s = 0; s < N; s++) {
      const { m, r, evt } = simulate(100 + s);
      if (eventStudy(r, m, evt)!.p < 0.05) rej++;
    }
    expect(rej / N).toBeGreaterThan(0.02);
    expect(rej / N).toBeLessThan(0.09);
  });
  it('predicted CAR variance matches the empirical variance of CARs', () => {
    const cars: number[] = [];
    let pred = 0;
    const N = 800;
    for (let s = 0; s < N; s++) {
      const { m, r, evt } = simulate(2000 + s);
      const res = eventStudy(r, m, evt)!;
      cars.push(res.car);
      pred += res.varCar;
    }
    const mu = cars.reduce((a, b) => a + b, 0) / N;
    const emp = cars.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1);
    expect(emp / (pred / N)).toBeGreaterThan(0.85);
    expect(emp / (pred / N)).toBeLessThan(1.18);
  });
  it('returns null without enough clean history or room after the event', () => {
    const { m, r } = simulate(3);
    expect(eventStudy(r, m, 100)).toBe(null);
    expect(eventStudy(r, m, 395)).toBe(null);
  });
  it('can exclude price-limit sessions from the estimation window', () => {
    const { m, r, evt } = simulate(4);
    const dirty = r.map((v, t) => (t === evt - 100 ? 9 : v));
    const a = eventStudy(dirty, m, evt)!;
    const b = eventStudy(dirty, m, evt, { excludeLimitDaysFromEstimation: true })!;
    expect(b.nEst).toBe(a.nEst - 1);
    expect(b.sigma).toBeLessThan(a.sigma);
  });
  it('counts limit sessions inside the window', () => {
    const { m, r, evt } = simulate(5);
    const spiky = r.map((v, t) => (t === evt ? 7 : v));
    expect(eventStudy(spiky, m, evt)!.limitDaysInWindow).toBe(1);
  });
});

describe('BMP aggregation', () => {
  const run = (seed: number, effect: number, n = 10) => {
    const items: { car: number; varCar: number }[] = [];
    for (let k = 0; k < n; k++) {
      const { m, r, evt } = simulate(seed * 100 + k, { 0: effect, 1: effect / 2 });
      const res = eventStudy(r, m, evt)!;
      items.push({ car: res.car, varCar: res.varCar });
    }
    return bmpTest(items)!;
  };
  it('detects a consistent effect across events', () => {
    const b = run(1, -3.5);
    expect(b.caar).toBeLessThan(-3.5);
    expect(b.t).toBeLessThan(-4);
    expect(b.p).toBeLessThan(0.01);
  });
  it('controls false positives under the null', () => {
    let rej = 0;
    const N = 60;
    for (let s = 0; s < N; s++) if (run(50 + s, 0, 8).p < 0.05) rej++;
    expect(rej / N).toBeLessThan(0.14);
  });
  it('needs at least three events', () => {
    expect(bmpTest([{ car: 1, varCar: 1 }, { car: 2, varCar: 1 }])).toBe(null);
  });
});
