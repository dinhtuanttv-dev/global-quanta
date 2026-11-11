import { describe, expect, it } from 'vitest';
import { dsToStock, type DsRow } from './dsStocks';
import { filterVerdict, DEFAULT_FILTER } from '../quant-cotuc';

const row = (o: Partial<DsRow> = {}): DsRow => ({ t: 'FPT', name: 'FPT Corp', sector: 'Công nghệ', sectorGroup: null, price: 50800, changePct: -1, liquidity20: 9e11, mcap: 9.6e13, trend: 'DOWN', ma50: 60764, ma200: 67791, rsi14: 41.2, rsRating: 30,
  yieldGross: 0.0394, yieldNet: 0.0374,
  div: { ttmCash: 2000, payments12m: 2, stockPct12m: 0, lastEx: '2026-05-28', lastCash: 1000, nextEx: null, nextCash: null, nextPay: null, nextRecord: null, agmNext: null, lastFy: 2025, lastFyCash: 2000, streak: 5, cagr3: 0, cuts5: 0, years5: 4, history: [] },
  fund: { quarter: 'Q3/2026', tpl: 'corp', pe: 9.56, pb: 3.8, roe: 0.2369, de: 0.3769, interestCover: 16, netDebtEbitda: -0.8, netMargin: 0.17, growthTtm: 0.148, npatYoY: 0.118, epsTtm: 5314, payout: 0.3764, fcfCover: 1.2, cfoToNpat: 0.49, accrual: 0.066, f: 5, m: -1.83, mFlag: false, z: 5.16, zZone: 'SAFE', flags: [] },
  ex: null, ...o });

describe('BL1 DS-v1 -> DividendStock', () => {
  it('chuyển đúng đơn vị (% ×100), tính lại lợi suất và P/E theo giá trực tiếp, cờ số thật', () => {
    const s = dsToStock(row(), 52000);
    expect(s.price).toBe(52000);
    expect(s.dividendYield).toBe(3.8); // 2.000 / 52.000
    expect(s.pe).toBe(9.8); // 52.000 / 5.314
    expect([s.roe, s.payoutRatio, s.growth, s.debtEquity, s.fscore, s.rsi]).toEqual([23.7, 37.6, 14.8, 0.3769, 5, 41.2]);
    expect([s.priceTrend, s.fundamentalsReal, s.payoutReal, s.growthReal, s.isUniverseOnly]).toEqual(['DOWN', true, true, true, false]);
    expect([s.exDividendDate, s.dividendAmount, s.paymentDate]).toEqual(['28/05/2026', 1000, '']); // chưa có đợt mới -> đợt gần nhất, không ngày trả
    expect(s.catalystScore).toBeNull();
  });
  it('đợt sắp tới ưu tiên hơn đợt cũ; thiếu dữ liệu -> 0 kèm cờ false (không giá trị mặc định)', () => {
    const s = dsToStock(row({ div: { ...row().div!, nextEx: '2026-12-01', nextCash: 1500, nextPay: '2026-12-20' } }));
    expect([s.exDividendDate, s.dividendAmount, s.paymentDate]).toEqual(['01/12/2026', 1500, '20/12/2026']);
    const bare = dsToStock(row({ t: 'XYZ', price: null, div: null, fund: null, trend: null, rsi14: null }));
    expect([bare.price, bare.dividendYield, bare.pe, bare.roe, bare.fscore, bare.rsi]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([bare.fundamentalsReal, bare.payoutReal, bare.growthReal, bare.priceTrend, bare.isUniverseOnly]).toEqual([false, false, false, null, true]);
    expect(filterVerdict(bare, { ...DEFAULT_FILTER, minRoe: 10, hideStaleEvents: false })).toBe('MISSING_DATA');
    expect(filterVerdict(dsToStock(row()), { ...DEFAULT_FILTER, minRoe: 20, maxPe: 12, hideStaleEvents: false })).toBe('PASS');
  });
});

describe("epsNote (EPS-v2, P1)", () => {
  it("ghi nguồn, hệ số IAS 33, từng sự kiện, cờ số CP và ghi chú quỹ KTPL; không có nguồn -> null", async () => {
    const { epsNote } = await import("./dsStocks");
    const f = { quarter: "Q3/2026", epsSource: "VND_EPS_TR", epsAdj: { factor: 1.5, epsQ: 4042, actions: [{ ex: "2026-10-29", cat: "STOCK", ratio: 50, factor: 1.5, kind: "STOCK" }] }, epsFlags: [] } as never;
    const s = epsNote(f)!;
    expect(s).toContain("EPS 4 quý VNDirect (quý Q3/2026)");
    expect(s).toContain("Điều chỉnh hồi tố IAS 33 ÷ 1,5");
    expect(s).toContain("4.042 đ");
    expect(s).toContain("cổ tức CP 50% — GDKHQ 29/10/2026");
    expect(s).toContain("quỹ khen thưởng phúc lợi");
    expect(epsNote({ quarter: "Q3/2026", epsSource: "NPAT_SHARES", epsAdj: null, epsFlags: ["SHARES_ANOMALY"] } as never)).toContain("bất thường");
    expect(epsNote({ quarter: "Q3/2026", epsSource: null } as never)).toBeNull();
    expect(epsNote(null)).toBeNull();
  });
});
