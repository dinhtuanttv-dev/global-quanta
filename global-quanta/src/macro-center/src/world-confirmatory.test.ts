import { describe, expect, it } from 'vitest';
import { mulberry32, randn } from './quant-macro';
import { runConfirmatory, WORLD_PREREG_PAIRS } from './world-confirmatory';

const gen = (T: number, beta: number, seed: number) => {
  const r = mulberry32(seed);
  const x = Array.from({ length: T }, () => randn(r));
  const y = x.map((_, t) => (t ? beta * x[t - 1] : 0) + randn(r));
  return { x, y };
};

describe('cổng xác nhận đặt trước W3', () => {
  it('đúng 12 cặp cố định, trễ 1, họ BY = 12', () => {
    expect(WORLD_PREREG_PAIRS).toHaveLength(12);
    expect(new Set(WORLD_PREREG_PAIRS.map((p) => `${p.factor}|${p.sector}`)).size).toBe(12);
  });

  it('hiệu ứng thật đúng chiều -> xác nhận; ngược chiều / không có -> không; thiếu dữ liệu -> p = 1 vẫn trong họ', () => {
    const strong = gen(150, -0.8, 1), none = gen(150, 0, 2), wrong = gen(150, 0.8, 3);
    const prep = {
      factors: { FED: strong.x, DXY: none.x, VIX: wrong.x },
      targets: { S_RE: strong.y, S_SEC: none.y },
    };
    const pairs = [
      { id: 'a', factor: 'FED', sector: 'S_RE', sign: -1 as const, mechanismVi: '' },
      { id: 'b', factor: 'DXY', sector: 'S_SEC', sign: -1 as const, mechanismVi: '' },
      { id: 'c', factor: 'VIX', sector: 'S_SEC', sign: -1 as const, mechanismVi: '' },
      { id: 'd', factor: 'TARIFF', sector: 'S_TEXTILE', sign: -1 as const, mechanismVi: '' },
    ];
    const prep2 = { ...prep, targets: { ...prep.targets, S_SEC: wrong.y } };
    const r = runConfirmatory(prep2, { pairs, B: 199 });
    expect(r.family).toBe(4);
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by.a.confirmed).toBe(true);
    expect(by.a.signOk).toBe(true);
    expect(by.c.signOk).toBe(false); // VIX→S_SEC thật là +, kỳ vọng − -> p một phía lớn
    expect(by.c.confirmed).toBe(false);
    expect(by.d.available).toBe(false);
    expect(by.d.pOneSided).toBe(1);
    expect(r.rows.every((x) => x.q >= x.pOneSided)).toBe(true);
    const r0 = runConfirmatory(prep, { pairs: pairs.slice(1, 2), B: 199 });
    expect(r0.rows[0].confirmed).toBe(false);
  });
});
