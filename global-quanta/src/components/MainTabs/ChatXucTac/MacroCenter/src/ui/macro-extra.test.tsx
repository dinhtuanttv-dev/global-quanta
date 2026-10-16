import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '../../../../../../test/rtl-lite';
import { DataSourcePanel, RegimePanel } from './MacroExtraPanels';
import type { MacroClient } from '../macro-client';
import type { SourcePayload } from './types';

afterEach(cleanup);

const src: SourcePayload = {
  mode: 'real', notice: null, minMonths: 60, realObservations: 1500, usableFactors: ['FED'], usableTargets: ['VNINDEX'], staleSeries: ['VNMIDCAP'],
  series: [
    { id: 'FED', nameVi: 'Lãi suất điều hành Fed', role: 'factor', n: 261, first: '2005-01', last: '2026-09', stale: false, sources: ['FRED:FEDFUNDS'] },
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
