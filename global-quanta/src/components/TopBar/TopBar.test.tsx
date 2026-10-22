import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopbarSnapshot } from '../../hooks/useTopbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: { data: TopbarSnapshot | undefined; error: Error | undefined } = { data: undefined, error: undefined };
vi.mock('../../hooks/useTopbar', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useTopbar')>()),
  useTopbar: () => ({ data: state.data, error: state.error, isLoading: !state.data && !state.error, enabled: true }),
}));
vi.mock('../../hooks/useSieuQuetScanner', () => ({ useSieuQuetScanner: () => ({ items: [{ ticker: 'FPT', companyName: 'FPT Corp', smartScore: 60 }] }) }));
vi.mock('./InfraHealthBadge', () => ({ default: () => null }));
const { default: TopBar } = await import('./TopBar');
const { useAppStore } = await import('../../store/useAppStore');

const meta = (status: string, reason: string | null = null) => ({ source: 'SSI_FC_V2', status, asOf: '2026-10-22T08:00:00Z', receivedAt: '2026-10-22T09:00:00Z', ageMs: 3600_000, staleAfterMs: 300_000, reason }) as never;
const snap = (over: Partial<TopbarSnapshot> = {}): TopbarSnapshot => ({
  version: 'topbar/T1', generatedAt: '2026-10-22T09:00:00Z', freshness: { liveMs: 60_000, delayedMs: 300_000 },
  index: { data: { code: 'VNINDEX', value: 1760.63, reference: 1738.72, change: 21.91, changePct: 1.26, volumeShares: 571952962, valueVnd: 13300615231030, unit: 'điểm', series: [{ time: 'a', value: 1700 }, { time: 'b', value: 1760 }], partialSession: false }, meta: meta('closed', 'Ngoài giờ khớp lệnh') },
  breadth: { data: { universe: 'VNINDEX (HOSE)', advances: 147, declines: 164, unchanged: 57, ceilings: 2, floors: 3, total: 368, advanceShare: 147 / 368, declineShare: 164 / 368, netBreadth: -17 / 368, adRatio: 0.896 }, meta: meta('closed') },
  sessions: { data: {
    VN: { exchange: 'HOSE', timezone: 'Asia/Ho_Chi_Minh', phase: 'closed', label: 'Đóng cửa', nextTransitionAt: null, calendar: 'gateway-observed', note: null },
    HK: { exchange: 'HKEX', timezone: 'Asia/Hong_Kong', phase: 'closed', label: 'Đóng cửa', nextTransitionAt: null, calendar: 'weekday', note: 'Chưa có lịch nghỉ lễ' },
    US: { exchange: 'NYSE', timezone: 'America/New_York', phase: 'open', label: 'Mở cửa', nextTransitionAt: null, calendar: 'weekday', note: null } }, meta: meta('live') },
  macro: [
    { data: { symbol: 'DXY', label: 'DXY', value: 101.617, unit: 'điểm', digits: 2, change: -0.1, changePct: -0.11, series: [] }, meta: meta('closed') },
    { data: { symbol: 'US10Y', label: 'US 10Y', value: 4.953, unit: '%', digits: 2, change: null, changePct: null, series: [] }, meta: meta('closed') },
    { data: null, meta: meta('error', 'Yahoo GC=F HTTP 500') },
  ],
  liquidity: { data: { measure: 'volume', unit: 'cổ phiếu', cutoff: '10:30', date: '2026-10-22', current: 1.5e8, history: Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, v: 1e8 + i * 1e6 })), n: 12, mean: 1.05e8, std: 4e6, deviationPct: 42, z: 2.6, reason: null }, meta: meta('live') },
  regime: { data: { state: 'NEUTRAL', score: 58, label: 'MÔ TẢ', evidence: { verdict: 'FAIL', note: 'KHÔNG ĐẠT kiểm định' } }, meta: meta('delayed') },
  ...over,
});

let el: HTMLDivElement;
const render = async () => { el = document.createElement('div'); document.body.appendChild(el); await act(async () => createRoot(el).render(<TopBar />)); };
const btn = (label: RegExp) => Array.from(el.querySelectorAll('button')).find((b) => label.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) as HTMLButtonElement;
beforeEach(() => { state.data = snap(); state.error = undefined; });
afterEach(() => { el?.remove(); document.querySelectorAll('.tb-popover').forEach((n) => n.remove()); });

describe('TopBar (TOPBAR T1–T4)', () => {
  it('logo ĐINH TUẤN; VN-Index với GIÁ TRỊ THẬT và nhãn ngoài phiên; không có chuông thông báo', async () => {
    await render();
    const t = el.textContent ?? '';
    expect(t).toContain('ĐINH TUẤN');
    expect(el.querySelector('.logo .mark')?.textContent).toBe('ĐT');
    expect(t).not.toContain('GLOBAL QUANTA');
    expect(t).toContain('1.760,6');
    expect(t).toContain('13.301 tỷ');
    expect(t).not.toContain('ước tính');
    expect(el.querySelector('[data-testid=tb-vnindex] [data-status=closed]')).toBeTruthy();
    expect(el.textContent).not.toContain('🔔');
  });

  it('độ rộng có số mã đứng giá; chưa có dữ liệu -> "—" (không vẽ 100% một phía); vĩ mô thiếu % -> "—", lỗi -> LỖI', async () => {
    await render();
    expect(el.querySelector('[data-testid=tb-breadth]')?.textContent).toContain('147▲ 57■ 164▼');
    expect(el.querySelector('[data-testid=tb-macro-US10Y]')?.textContent).toContain('—');
    expect(el.querySelector('[data-testid=tb-macro-GOLD] [data-status=error]')).toBeTruthy();
    el.remove();
    state.data = snap({ breadth: { data: null, meta: meta('empty', 'SSI chưa trả') } });
    await render();
    expect(el.querySelector('[data-testid=tb-breadth] .breadth-bar')).toBeNull();
    expect(el.querySelector('[data-testid=tb-breadth]')?.textContent).toContain('—');
  });

  it('chế độ thị trường luôn có nhãn MÔ TẢ; thiếu dữ liệu -> CHƯA XÁC ĐỊNH (không mặc định Trung lập)', async () => {
    state.data = snap({ regime: { data: null, meta: meta('empty') } });
    await render();
    expect(el.textContent).toContain('CHƯA XÁC ĐỊNH');
    expect(el.textContent).toContain('MÔ TẢ');
  });

  it('avatar mở menu (không đăng xuất ngay); "Đăng xuất" là mục riêng', async () => {
    const logout = vi.fn();
    useAppStore.setState({ logout });
    await render();
    await act(async () => btn(/Tài khoản/).click());
    expect(logout).not.toHaveBeenCalled();
    const menu = document.querySelector('[data-testid=tb-account]')!;
    await act(async () => (Array.from(menu.querySelectorAll('button')).find((b) => b.textContent === 'Đăng xuất') as HTMLButtonElement).click());
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('popover thanh khoản: bấm bên trong không đóng, Escape đóng và trả focus về nút mở; có z và thước đo', async () => {
    await render();
    const trigger = btn(/Thanh khoản lũy kế 10:30/);
    await act(async () => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = document.querySelector('[data-testid=tb-liq-detail]')!;
    expect(panel.textContent).toContain('khối lượng khớp lệnh');
    expect(panel.textContent).toContain('+2,60σ');
    expect(panel.textContent).toContain('CAO BẤT THƯỜNG');
    await act(async () => { panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    expect(document.querySelector('[data-testid=tb-liq-detail]')).toBeTruthy();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[data-testid=tb-liq-detail]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('tìm mã ngoài danh sách: Enter chỉ CHỌN mã (không thêm danh mục); thêm danh mục là lựa chọn riêng; ARIA combobox', async () => {
    useAppStore.setState({ scannerFocus: null, selectedTicker: null });
    await render();
    const input = el.querySelector('input[role=combobox]') as HTMLInputElement;
    await act(async () => { input.focus(); });
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'abc'); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('tb-search-list');
    const opts = Array.from(el.querySelectorAll('[role=option]')).map((o) => o.textContent);
    expect(opts[0]).toContain('Chọn ABC');
    expect(opts[1]).toContain('Thêm ABC vào ★ Danh mục');
    expect(input.getAttribute('aria-activedescendant')).toBe('tbs-sel-ABC');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(useAppStore.getState().selectedTicker).toBe('ABC');
    expect(useAppStore.getState().scannerFocus).toBeNull();
  });

  it('"Thị trường ▾" mở panel có độ rộng, phiên, vĩ mô, thanh khoản (không ẩn mất tính năng ở màn hình hẹp)', async () => {
    await render();
    await act(async () => btn(/Chi tiết thị trường/).click());
    const d = document.querySelector('[data-testid=tb-details]')!;
    for (const s of ['Chế độ thị trường', 'Độ rộng', 'Phiên giao dịch', 'Vĩ mô', 'Thanh khoản lũy kế 10:30']) expect(d.textContent).toContain(s);
    expect(d.textContent).toContain('/368 mã VNINDEX (HOSE)');
  });
});
