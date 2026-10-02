import { describe, expect, it } from 'vitest';
import {
  betaBinomialPosterior,
  estimatePriorFromRates,
  invertRegularizedIncompleteBeta,
  regularizedIncompleteBeta,
} from './beta-binomial';

describe('regularizedIncompleteBeta: giá trị đã biết', () => {
  it('Beta(1,1) là phân phối đều ⇒ I_x(1,1) = x với mọi x', () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(regularizedIncompleteBeta(x, 1, 1)).toBeCloseTo(x, 10);
    }
  });
  it('Beta(2,1) có CDF = x² (mật độ 2x trên [0,1])', () => {
    for (const x of [0.1, 0.3, 0.5, 0.8]) {
      expect(regularizedIncompleteBeta(x, 2, 1)).toBeCloseTo(x * x, 8);
    }
  });
  it('Beta(1,2) có CDF = 1-(1-x)² (mật độ 2(1-x))', () => {
    for (const x of [0.1, 0.3, 0.5, 0.8]) {
      expect(regularizedIncompleteBeta(x, 1, 2)).toBeCloseTo(1 - (1 - x) ** 2, 8);
    }
  });
  it('đối xứng: I_0.5(a,a) = 0.5 với mọi a (Beta(a,a) đối xứng quanh 0.5)', () => {
    for (const a of [1, 2, 5, 10, 30]) {
      expect(regularizedIncompleteBeta(0.5, a, a)).toBeCloseTo(0.5, 8);
    }
  });
  it('tính chất đối ngẫu: I_x(a,b) = 1 - I_{1-x}(b,a)', () => {
    const cases: [number, number, number][] = [
      [0.3, 2, 5],
      [0.7, 5, 2],
      [0.1, 3, 8],
      [0.9, 8, 3],
    ];
    for (const [x, a, b] of cases) {
      expect(regularizedIncompleteBeta(x, a, b)).toBeCloseTo(1 - regularizedIncompleteBeta(1 - x, b, a), 8);
    }
  });
  it('biên x=0 ⇒ 0, x=1 ⇒ 1, ngoài [0,1] vẫn kẹp về biên', () => {
    expect(regularizedIncompleteBeta(0, 3, 4)).toBe(0);
    expect(regularizedIncompleteBeta(1, 3, 4)).toBe(1);
    expect(regularizedIncompleteBeta(-0.5, 3, 4)).toBe(0);
    expect(regularizedIncompleteBeta(1.5, 3, 4)).toBe(1);
  });
  it('đơn điệu tăng ngặt theo x (cần cho việc nghịch đảo bằng chia đôi luôn đúng)', () => {
    const xs = [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.95];
    let prev = -Infinity;
    for (const x of xs) {
      const v = regularizedIncompleteBeta(x, 4, 9);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
  it('a hoặc b không dương ⇒ ném lỗi', () => {
    expect(() => regularizedIncompleteBeta(0.5, 0, 3)).toThrow();
    expect(() => regularizedIncompleteBeta(0.5, 3, -1)).toThrow();
  });
});

describe('invertRegularizedIncompleteBeta: nghịch đảo đúng chiều', () => {
  it('invert(I_x(a,b), a, b) ≈ x cho nhiều bộ tham số khác nhau', () => {
    const cases: [number, number, number][] = [
      [0.3, 2, 5],
      [0.5, 1, 1],
      [0.1, 10, 3],
      [0.95, 4, 4],
      [0.6, 0.5, 0.5], // a,b < 1 (mật độ chữ U) — trường hợp khó cho continued fraction
    ];
    for (const [x, a, b] of cases) {
      const p = regularizedIncompleteBeta(x, a, b);
      expect(invertRegularizedIncompleteBeta(p, a, b)).toBeCloseTo(x, 6);
    }
  });
  it('biên p=0 ⇒ 0, p=1 ⇒ 1', () => {
    expect(invertRegularizedIncompleteBeta(0, 3, 4)).toBe(0);
    expect(invertRegularizedIncompleteBeta(1, 3, 4)).toBe(1);
  });
  it('median của Beta(a,a) là 0.5', () => {
    for (const a of [1, 3, 7]) {
      expect(invertRegularizedIncompleteBeta(0.5, a, a)).toBeCloseTo(0.5, 6);
    }
  });
});

describe('betaBinomialPosterior', () => {
  it('không có prior thông tin (α₀=β₀=1) và không có dữ liệu ⇒ posterior = Beta(1,1), mean=0.5', () => {
    const p = betaBinomialPosterior(0, 0, 1, 1, 0.9);
    expect(p.mean).toBeCloseTo(0.5, 10);
    expect(p.ci[0]).toBeLessThan(0.5);
    expect(p.ci[1]).toBeGreaterThan(0.5);
  });
  it('càng nhiều dữ liệu cùng tỷ lệ thắng thô, khoảng tin cậy càng hẹp và posterior mean tiến gần tỷ lệ thô hơn', () => {
    const few = betaBinomialPosterior(3, 1, 1, 1, 0.9); // 3 thắng/4 sự kiện, tỷ lệ thô 75%
    const many = betaBinomialPosterior(30, 10, 1, 1, 0.9); // cùng tỷ lệ thô 75%, gấp 10 lần mẫu
    const widthFew = few.ci[1] - few.ci[0];
    const widthMany = many.ci[1] - many.ci[0];
    expect(widthMany).toBeLessThan(widthFew);
    // Với mẫu ít, prior Beta(1,1) kéo mean về gần 0,5 hơn; mẫu nhiều thì mean tiến gần tỷ lệ thô 0,75.
    expect(Math.abs(many.mean - 0.75)).toBeLessThan(Math.abs(few.mean - 0.75));
  });
  it('mẫu nhỏ (3/4) KHÔNG được kết luận chắc chắn — cận dưới CI phải thấp hơn nhiều so với mean', () => {
    const p = betaBinomialPosterior(3, 1, 1, 1, 0.9);
    expect(p.mean).toBeCloseTo(4 / 6, 6); // (1+3)/(1+1+3+1) = 4/6, KHÔNG phải tỷ lệ thô 3/4
    expect(p.ci[0]).toBeLessThan(0.5); // với mẫu này, cận dưới 90% phải tụt xuống dưới 50%
  });
  it('prior lệch (α₀ lớn) kéo posterior về gần prior khi dữ liệu ít', () => {
    const optimisticPrior = betaBinomialPosterior(1, 0, 8, 2, 0.9); // prior mean 0.8, chỉ thêm 1 sự kiện thắng
    expect(optimisticPrior.mean).toBeCloseTo(9 / 11, 6);
    expect(optimisticPrior.mean).toBeGreaterThan(0.75); // gần prior 0.8 hơn là "100% thắng" của riêng 1 mẫu
  });
  it('wins/losses âm hoặc alpha0/beta0 không dương ⇒ ném lỗi', () => {
    expect(() => betaBinomialPosterior(-1, 2)).toThrow();
    expect(() => betaBinomialPosterior(2, -1)).toThrow();
    expect(() => betaBinomialPosterior(2, 1, 0, 1)).toThrow();
  });
  it('level khác nhau cho khoảng rộng khác nhau, cùng chứa mean', () => {
    const p50 = betaBinomialPosterior(5, 5, 1, 1, 0.5);
    const p95 = betaBinomialPosterior(5, 5, 1, 1, 0.95);
    expect(p95.ci[1] - p95.ci[0]).toBeGreaterThan(p50.ci[1] - p50.ci[0]);
    expect(p50.ci[0]).toBeLessThanOrEqual(p50.mean);
    expect(p50.ci[1]).toBeGreaterThanOrEqual(p50.mean);
  });
});

describe('estimatePriorFromRates', () => {
  it('mảng rỗng ⇒ Beta(1,1) trung tính (không bịa thông tin)', () => {
    expect(estimatePriorFromRates([])).toEqual({ alpha0: 1, beta0: 1 });
  });
  it('mọi tỷ lệ giống hệt nhau ⇒ phương sai 0, dùng priorStrength mặc định', () => {
    const { alpha0, beta0 } = estimatePriorFromRates([0.7, 0.7, 0.7, 0.7], 10);
    expect(alpha0 / (alpha0 + beta0)).toBeCloseTo(0.7, 6);
    expect(alpha0 + beta0).toBeCloseTo(10, 6);
  });
  it('phương sai cao (tỷ lệ phân tán nhiều giữa các mã) ⇒ prior yếu hơn (alpha0+beta0 nhỏ hơn)', () => {
    const tight = estimatePriorFromRates([0.5, 0.52, 0.48, 0.5], 20);
    const spread = estimatePriorFromRates([0.1, 0.9, 0.2, 0.8], 20);
    expect(spread.alpha0 + spread.beta0).toBeLessThan(tight.alpha0 + tight.beta0);
  });
  it('bỏ qua giá trị NaN/ngoài [0,1] lẫn trong mảng', () => {
    const a = estimatePriorFromRates([0.6, 0.6, 0.6]);
    const b = estimatePriorFromRates([0.6, Number.NaN, 0.6, -1, 0.6, 1.5]);
    expect(a.alpha0 / (a.alpha0 + a.beta0)).toBeCloseTo(b.alpha0 / (b.alpha0 + b.beta0), 6);
  });
  it('một phần tử duy nhất ⇒ dùng thẳng làm mean với priorStrength', () => {
    const { alpha0, beta0 } = estimatePriorFromRates([0.4], 6);
    expect(alpha0).toBeCloseTo(2.4, 6);
    expect(beta0).toBeCloseTo(3.6, 6);
  });
});
