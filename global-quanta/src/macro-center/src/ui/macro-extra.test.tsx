import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '../../../test/rtl-lite';
import { DataSourcePanel, RegimePanel } from './MacroExtraPanels';
import type { MacroClient } from '../macro-client';
import type { SourcePayload } from './types';

afterEach(cleanup);

const src: SourcePayload = {
  mode: 'real', notice: null, minMonths: 60, realObservations: 1500, usableFactors: ['FED'], usableTargets: ['VNINDEX'], staleSeries: ['VNMIDCAP'],
  series: [
    { id: 'FED', nameVi: 'Lãi suất quỹ Fed hiệu dụng (bình quân tháng)', role: 'factor', n: 261, first: '2005-01', last: '2026-09', stale: false, sources: ['FRED:FEDFUNDS'] },
    { id: 'CPI', nameVi: 'Lạm phát', role: 'factor', n: 0, first: null, last: null, stale: false, sources: [] },
    { id: 'VNMIDCAP', nameVi: 'VNMidcap', role: 'target', n: 77, first: '2018-12', last: '2025-04', stale: true, sources: ['gateway-hose'] },
    { id: 'VNALLSHARE', nameVi: 'VNAllshare', role: 'target', n: 17, first: '2025-05', last: '2026-09', stale: false, sources: ['gateway-hose'] },
  ],
};

describe('Panel nguồn dữ liệu', () => {
  it('nêu rõ chế độ thật, nguồn, chuỗi ngừng cập nhật bị loại, chuỗi chưa đủ 60 tháng, biến chưa có số liệu', () => {
    const { container } = render(<DataSourcePanel source={src} sourceError={null} series={null} />);
    const t = container.textContent ?? '';
    expect(t).toContain('SỐ LIỆU THẬT');
    expect(t).toContain('FRED:FEDFUNDS');
    expect(t).toContain('Ngừng cập nhật từ 2025-04 — đã loại');
    expect(t).toContain('Mới 17 tháng (< 60) — chưa dùng');
    expect(t).toContain('Chưa có số liệu thật');
    expect(t).toContain('HOSE (lịch sử giá Gateway)');
  });
});

describe('Panel chế độ vĩ mô', () => {
  it('thiếu IR/CPI/M2 -> báo lỗi của API và hướng dẫn nạp dữ liệu, không vẽ số liệu', async () => {
    const client = { regime: async () => { throw new Error('Cần ít nhất một trong IR, CPI, M2 để nhận diện chế độ.'); }, regimeImpact: async () => ({}) } as unknown as MacroClient;
    let c!: HTMLElement;
    await act(async () => { c = render(<RegimePanel client={client} enabled names={{}} factors={['FED']} targets={['VNINDEX']} />).container; });
    expect(c.textContent).toContain('Cần ít nhất một trong IR, CPI, M2');
    expect(c.textContent).toContain('phải nạp CSV');
    expect(c.querySelector('.rg-strip')).toBeNull();
  });
});

// V0 (19/11/2026): payload /regime THẬT của production (rút gọn lịch sử 3 kỳ) — 1 biến CPI, K=3 ở mức trần, xác suất 0,99999.
const REGIME_PROD = {"dataVersion":"v1","asOf":"2026-11-19","firstPeriod":"2016-10","lastPeriod":"2026-09","features":["CPI"],"K":3,"bicByK":[{"K":1,"bic":374.19603418124797},{"K":2,"bic":317.5300919735686},{"K":3,"bic":296.56788714185353}],"summary":[{"state":0,"meanRaw":[1.463390528155404],"sdRaw":[0.9484637208144145],"expectedDurationMonths":5.291997432945836,"stationaryShare":0.11270608866838237,"label":"Chế độ thấp","meansByFeature":{"CPI":1.463390528155404}},{"state":1,"meanRaw":[2.9513036777378368],"sdRaw":[0.4365241767892806],"expectedDurationMonths":9.236925453381213,"stationaryShare":0.5912377321168311,"label":"Chế độ trung tính","meansByFeature":{"CPI":2.9513036777378368}},{"state":2,"meanRaw":[4.590716915765352],"sdRaw":[0.5797860650920243],"expectedDurationMonths":6.928479745751401,"stationaryShare":0.29605617921478705,"label":"Chế độ cao","meansByFeature":{"CPI":4.590716915765352}}],"current":{"probs":[2.152263136659642e-8,0.0000021936215252268067,0.9999977848558433],"state":2,"label":"Chế độ cao"},"history":[{"period":"2026-07","probs":[1.6910651172026696e-7,0.0006359154411499924,0.9993639154523383]},{"period":"2026-08","probs":[6.496473630755595e-8,0.000014687250746969368,0.9999852477845167]},{"period":"2026-09","probs":[2.152263136659642e-8,0.0000021936215252268067,0.9999977848558433]}],"note":"Xác suất lọc (forward) — an toàn cho quyết định thời gian thực; không dùng thông tin tương lai."};

describe('V0 — trung thực về dữ liệu', () => {
  it('liệt kê điểm bị cách ly vì lệch thang đo, kèm lý do và nguồn', () => {
    const q = { ...src, quarantined: [
      { seriesId: 'EX', period: '2016-01', value: 2.2779, seriesMedian: 23185, source: 'Yahoo:VND=X (thị trường)', reason: 'Lệch thang đo ÷10178 so với trung vị của chuỗi' },
      { seriesId: 'VNINDEX', period: '2019-07', value: 99166, seriesMedian: 1018, source: 'gateway-hose', reason: 'Lệch thang đo ×97 so với trung vị của chuỗi' },
    ] };
    const { container } = render(<DataSourcePanel source={q} sourceError={null} series={null} />);
    const t = container.querySelector('[data-testid="mc-quarantine"]')?.textContent ?? '';
    expect(t).toContain('Đã cách ly 2 điểm lệch thang đo');
    expect(t).toContain('EX 2016-01');
    expect(t).toContain('÷10178');
    expect(t).toContain('HOSE (lịch sử giá Gateway)');
  });
  it('Gateway cũ (không có quarantined) -> không hiện khối cách ly', () => {
    const { container } = render(<DataSourcePanel source={src} sourceError={null} series={null} />);
    expect(container.querySelector('[data-testid="mc-quarantine"]')).toBeNull();
  });
  it('chế độ 1 biến CPI: nói rõ là chế độ lạm phát, K ở mức trần, không hiện xác suất 100%', async () => {
    const client = { regime: async () => REGIME_PROD, regimeImpact: async () => { throw new Error('cần ít nhất 2 chế độ'); } } as unknown as MacroClient;
    let c!: HTMLElement;
    await act(async () => { c = render(<RegimePanel client={client} enabled names={{}} factors={[]} targets={[]} />).container; });
    const t = c.textContent ?? '';
    expect(t).toContain('1 biến (CPI)');
    expect(t).toContain('thực chất là chế độ lạm phát');
    expect(t).toContain('mức trần được thử');
    expect(t).toContain('> 99%');
    expect(t).not.toMatch(/xác suất lọc 100%/);
  });
});
