import { describe, expect, it } from 'vitest';
import {
  WEAK_ANNOUNCE_PRIOR,
  announceCdf,
  announceCredibleInterval,
  announceDensity,
  announcePredictive,
  announceQuantile,
  estimateAnnouncePriorFromUniverse,
  probAnnounceBetween,
} from './announce-date-model';
import type { AnnouncePredictive } from './announce-date-model';

const std = (nu: number): AnnouncePredictive => ({ mu: 0, scale: 1, dof: nu, n: 10 });

describe('CDF Student-t (đối chiếu công thức đóng đã biết)', () => {
  it('đối xứng: CDF(0) = 0,5; CDF(-t) = 1 − CDF(t)', () => {
    for (const nu of [1, 2, 5, 30]) {
      expect(announceCdf(std(nu), 0)).toBeCloseTo(0.5, 10);
      expect(announceCdf(std(nu), -1.3)).toBeCloseTo(1 - announceCdf(std(nu), 1.3), 8);
    }
  });
  it('ν=1 (Cauchy): CDF(t) = 0,5 + atan(t)/π ⇒ CDF(1) = 0,75', () => {
    expect(announceCdf(std(1), 1)).toBeCloseTo(0.75, 8);
    expect(announceCdf(std(1), 3)).toBeCloseTo(0.5 + Math.atan(3) / Math.PI, 8);
  });
  it('ν=2: CDF(t) = 0,5 + t/(2·sqrt(2+t²))', () => {
    for (const t of [0.5, 1, 2.5]) {
      expect(announceCdf(std(2), t)).toBeCloseTo(0.5 + t / (2 * Math.sqrt(2 + t * t)), 8);
    }
  });
  it('ν lớn hội tụ về chuẩn: CDF(1,96) ≈ 0,975', () => {
    expect(announceCdf(std(1000), 1.96)).toBeCloseTo(0.975, 3);
  });
});

describe('mật độ và xác suất khoảng', () => {
  it('mật độ tích phân xấp xỉ 1 (quy tắc hình thang trên [-60,60])', () => {
    const m = std(4);
    let sum = 0;
    const h = 0.01;
    for (let x = -60; x <= 60; x += h) sum += announceDensity(m, x) * h;
    expect(sum).toBeCloseTo(1, 2);
  });
  it('probAnnounceBetween = CDF(hi) − CDF(lo), và khoảng ngược ⇒ 0', () => {
    const m: AnnouncePredictive = { mu: 30, scale: 5, dof: 6, n: 8 };
    expect(probAnnounceBetween(m, 25, 35)).toBeCloseTo(announceCdf(m, 35) - announceCdf(m, 25), 12);
    expect(probAnnounceBetween(m, 35, 25)).toBe(0);
    expect(probAnnounceBetween(m, -1e6, 1e6)).toBeCloseTo(1, 6);
  });
});

describe('phân vị', () => {
  it('quantile là nghịch đảo của CDF', () => {
    const m: AnnouncePredictive = { mu: 32, scale: 4, dof: 5, n: 6 };
    for (const p of [0.05, 0.25, 0.5, 0.8, 0.95]) {
      expect(announceCdf(m, announceQuantile(m, p))).toBeCloseTo(p, 6);
    }
  });
  it('p ngoài (0,1) ném lỗi', () => {
    expect(() => announceQuantile(std(3), 0)).toThrow();
    expect(() => announceQuantile(std(3), 1)).toThrow();
  });
  it('khoảng tin cậy đối xứng quanh mu và rộng hơn khi mức tin cậy cao hơn', () => {
    const m: AnnouncePredictive = { mu: 30, scale: 3, dof: 8, n: 8 };
    const [l90, h90] = announceCredibleInterval(m, 0.9);
    const [l99, h99] = announceCredibleInterval(m, 0.99);
    expect(30 - l90).toBeCloseTo(h90 - 30, 6);
    expect(h99 - l99).toBeGreaterThan(h90 - l90);
  });
});

describe('announcePredictive (hậu nghiệm Normal-Inverse-Gamma)', () => {
  it('n=0 ⇒ dự báo bằng prior', () => {
    const m = announcePredictive([]);
    expect(m.mu).toBe(WEAK_ANNOUNCE_PRIOR.mu0);
    expect(m.n).toBe(0);
    expect(m.dof).toBeCloseTo(2 * WEAK_ANNOUNCE_PRIOR.a0, 10);
  });
  it('nhiều dữ liệu tập trung quanh 40 ⇒ mu → 40 và khoảng dự báo hẹp lại', () => {
    const few = announcePredictive([38, 41, 40]);
    const many = announcePredictive([38, 41, 40, 39, 42, 40, 41, 39, 40, 41, 38, 42]);
    expect(Math.abs(many.mu - 40)).toBeLessThan(Math.abs(WEAK_ANNOUNCE_PRIOR.mu0 - 40));
    const wFew = announceCredibleInterval(few)[1] - announceCredibleInterval(few)[0];
    const wMany = announceCredibleInterval(many)[1] - announceCredibleInterval(many)[0];
    expect(wMany).toBeLessThan(wFew);
    expect(many.dof).toBeGreaterThan(few.dof);
  });
  it('n nhỏ cho khoảng dự báo RỘNG HƠN xấp xỉ chuẩn cùng std mẫu (đuôi dày)', () => {
    const xs = [38, 41, 40];
    const m = announcePredictive(xs);
    const mean = 39.6667;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / 2);
    const [lo, hi] = announceCredibleInterval(m, 0.9);
    expect(hi - lo).toBeGreaterThan(2 * 1.645 * sd);
  });
  it('bỏ qua NaN/Infinity', () => {
    const a = announcePredictive([30, 32, 31]);
    const b = announcePredictive([30, Number.NaN, 32, Infinity, 31]);
    expect(b.mu).toBeCloseTo(a.mu, 10);
    expect(b.n).toBe(3);
  });
});

describe('estimateAnnouncePriorFromUniverse', () => {
  it('ít hơn 2 mã ⇒ prior yếu mặc định', () => {
    expect(estimateAnnouncePriorFromUniverse([[30, 31]])).toEqual(WEAK_ANNOUNCE_PRIOR);
    expect(estimateAnnouncePriorFromUniverse([])).toEqual(WEAK_ANNOUNCE_PRIOR);
  });
  it('mu0 là trung bình các trung bình mã; kappa0 kẹp trong [0,5; 10]', () => {
    const p = estimateAnnouncePriorFromUniverse([[20, 22, 21], [40, 42, 41], [30, 31, 29]]);
    expect(p.mu0).toBeCloseTo(92 / 3, 6); // trung bình của (21, 41, 30)
    expect(p.kappa0).toBeGreaterThanOrEqual(0.5);
    expect(p.kappa0).toBeLessThanOrEqual(10);
    expect(p.b0).toBeGreaterThan(0);
  });
});

import { probAnnounceWithinGivenNotYet } from './announce-date-model';

describe('probAnnounceWithinGivenNotYet (xác suất có điều kiện)', () => {
  const m: AnnouncePredictive = { mu: 30, scale: 4, dof: 8, n: 10 };
  it('lớn hơn xác suất không điều kiện khi đã trôi qua phần lớn thời gian điển hình', () => {
    const uncond = announceCdf(m, 40) - announceCdf(m, 35);
    const cond = probAnnounceWithinGivenNotYet(m, 35, 5);
    expect(cond).toBeGreaterThan(uncond);
  });
  it('horizon ≤ 0 ⇒ 0; luôn nằm trong [0,1]', () => {
    expect(probAnnounceWithinGivenNotYet(m, 20, 0)).toBe(0);
    for (const e of [0, 20, 30, 60, 1000]) {
      const p = probAnnounceWithinGivenNotYet(m, e, 10);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
  it('elapsed rất lớn (đuôi gần 0) ⇒ 1, không chia cho 0', () => {
    expect(probAnnounceWithinGivenNotYet(m, 1e6, 5)).toBe(1);
  });
  it('horizon rất lớn ⇒ xác suất → 1', () => {
    expect(probAnnounceWithinGivenNotYet(m, 10, 500)).toBeGreaterThan(0.999);
  });
});
