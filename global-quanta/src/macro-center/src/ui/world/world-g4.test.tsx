// G4 (20/11/2026): trục + bảng thay thế cho biểu đồ cột, chọn tầm nhìn dạng nút, khung chờ tải, thanh z hai phía.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColumnChart, HorizonPills, Skeleton } from './shared';
import { WorldPulse } from './WorldPulse';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mount = async (node: React.ReactNode) => { const el = document.createElement('div'); el.className = 'wd'; document.body.appendChild(el); await act(async () => { createRoot(el).render(node); }); return el; };
afterEach(() => { document.body.innerHTML = ''; });

describe('G4', () => {
  it('ColumnChart: trục Y theo thang, nhãn X, chú thích từng cột, bảng thay thế đúng giá trị truyền vào', async () => {
    const el = await mount(<ColumnChart values={[0.5, -2.25, 3]} scale={20} half={60} ci={[{ lo: 0, hi: 1 }, { lo: -3, hi: -1.5 }, { lo: 1, hi: 5 }]} label="đáp ứng"
      xLabel={(i) => `T${i}`} highlight={(i) => i === 2} tableCaption="bảng" />);
    expect([...el.querySelectorAll('.cols-y span')].map((s) => s.textContent)).toEqual(['+3%', '0', '−3%']);
    expect([...el.querySelectorAll('.cols-x span')].map((s) => s.textContent)).toEqual(['T0', 'T1', 'T2']);
    expect(el.querySelector('.cols-x span.hl')!.textContent).toBe('T2');
    expect(el.querySelectorAll('.col')[1].getAttribute('title')).toBe('T1: −2,3% (khoảng 90%: −3 đến −1,5%)');
    const rows = [...el.querySelectorAll('.cols-table tbody tr')].map((r) => r.textContent);
    expect(rows).toEqual(['T0+0,50 đến +1', 'T1−2,3−3 đến −1,5', 'T2+3+1 đến +5']);
  });
  it('ColumnChart không có tham số mới -> như cũ (không nhãn X, không bảng)', async () => {
    const el = await mount(<ColumnChart values={[1, -1]} scale={10} label="x" />);
    expect(el.querySelector('.cols-x')).toBeNull();
    expect(el.querySelector('.cols-table')).toBeNull();
    expect(el.querySelectorAll('.col')).toHaveLength(2);
  });
  it('HorizonPills: một nút được chọn, bấm đổi tầm nhìn', async () => {
    const on = vi.fn();
    const el = await mount(<HorizonPills value={3} onChange={on} idPrefix="t" />);
    expect([...el.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent)).toEqual(['3 tháng']);
    await act(async () => { (el.querySelector('[data-testid="t-12"]') as HTMLButtonElement).click(); });
    expect(on).toHaveBeenCalledWith(12);
  });
  it('Skeleton: có dòng trạng thái cho trình đọc màn hình, đúng số hàng', async () => {
    const el = await mount(<Skeleton kind="table" rows={4} label="Đang tải…" />);
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Đang tải…');
    expect(el.querySelectorAll('.skel-row')).toHaveLength(4);
  });
  it('WorldPulse: thanh z âm mang lớp "neg", dương "pos"; thẻ bất thường có lớp "unusual"', async () => {
    const el = await mount(<WorldPulse pulse={[{ id: 'a', nameVi: 'A', z: -1.2, unusual: false, links: 0 }, { id: 'b', nameVi: 'B', z: 2.4, unusual: true, links: 1 }]} />);
    const bars = el.querySelectorAll('.pulse-bar');
    expect(bars[0].className).toContain('neg'); expect(bars[1].className).toContain('pos');
    expect(el.querySelectorAll('.pulse-card.unusual')).toHaveLength(1);
  });
});
