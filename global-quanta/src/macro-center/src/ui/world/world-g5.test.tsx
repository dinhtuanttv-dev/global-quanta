// G5 (20/11/2026): mạng lan truyền dạng vòng — vẽ đúng bảng lan truyền thật (production 19/11/2026), không tính chỉ số mới.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EDGE_MIN_PCT, SpilloverNetwork, spillEdges } from './SpilloverNetwork';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const C = JSON.parse(readFileSync(resolve(process.cwd(), 'src/macro-center/src/__fixtures__/world-prod-2026-11-19/connectedness.json'), 'utf8'));
const mount = async (node: React.ReactNode) => { const el = document.createElement('div'); el.className = 'wd'; document.body.appendChild(el); await act(async () => { createRoot(el).render(node); }); return el; };
afterEach(() => { document.body.innerHTML = ''; });

describe('SpilloverNetwork (G5)', () => {
  it('spillEdges: đúng mọi ô ngoài đường chéo ≥ 5%, chiều j → i, sắp giảm dần', () => {
    const e = spillEdges(C.recent.table);
    expect(EDGE_MIN_PCT).toBe(5);
    expect(e).toHaveLength(16);
    for (const x of e) { expect(x.from).not.toBe(x.to); expect(x.pct).toBe(C.recent.table[x.to][x.from]); expect(x.pct).toBeGreaterThanOrEqual(5); }
    expect(e[0]).toEqual({ from: 2, to: 3, pct: C.recent.table[3][2] }); // Hàn Quốc nhận 26,7% từ Nhật (ô lớn nhất ngoài đường chéo)
    expect(Math.round(e[0].pct * 10) / 10).toBe(26.7);
    expect(e.map((x) => x.pct)).toEqual([...e.map((x) => x.pct)].sort((a, b) => b - a));
  });
  it('vẽ 6 nút (Việt Nam ở tâm), 16 cạnh; 2 cạnh vào Việt Nam tô vàng; ghi số chiều bị ẩn', async () => {
    const el = await mount(<SpilloverNetwork names={C.names} table={C.recent.table} net={C.recent.net} vnIndex={5} />);
    expect(el.querySelectorAll('[data-testid^="sn-node-"]')).toHaveLength(6);
    expect(el.querySelectorAll('[data-testid^="sn-edge-"]')).toHaveLength(16);
    expect(el.querySelectorAll('.sn-edge.vn')).toHaveLength(2);
    const vn = el.querySelector('[data-testid="sn-node-5"]')!;
    expect(vn.querySelector('circle')!.getAttribute('cx')).toBe('280'); expect(vn.querySelector('circle')!.getAttribute('cy')).toBe('200');
    expect(vn.getAttribute('aria-label')).toBe('Việt Nam: lan truyền ròng −8,7 điểm % (nhận ròng)');
    expect(el.querySelector('[data-testid="sn-node-2"]')!.getAttribute('class')).toContain('giver'); // Nhật phát ra ròng +13,3
    expect(el.querySelector('figcaption')!.textContent).toContain('Ẩn 14 chiều dưới 5%');
  });
  it('focus một nút: chỉ sáng cạnh của nút đó (cạnh khác mờ)', async () => {
    const el = await mount(<SpilloverNetwork names={C.names} table={C.recent.table} net={C.recent.net} vnIndex={5} />);
    await act(async () => { (el.querySelector('[data-testid="sn-node-4"]') as SVGGElement).dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    const dim = [...el.querySelectorAll('.sn-edge')].filter((g) => g.getAttribute('class')!.includes('dim'));
    const lit = [...el.querySelectorAll('.sn-edge')].filter((g) => !g.getAttribute('class')!.includes('dim'));
    expect(lit.length).toBeGreaterThan(0);
    for (const g of lit) { const [f, t] = g.getAttribute('data-testid')!.replace('sn-edge-', '').split('-').map(Number); expect(f === 4 || t === 4).toBe(true); }
    expect(dim.length).toBe(16 - lit.length);
  });
});
