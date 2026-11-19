// W1–W4 (19/11/2026): so sánh kịch bản, dòng thời gian sự kiện, bộ lọc được nhớ, bộ đệm world-client. Dữ liệu = phản hồi thật production 19/11/2026.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioCompare, compareRows, heatLevel, DEFAULT_COMPARE } from './ScenarioCompare';
import { DEFAULT_EVENT_FILTER, EventTimeline, filterEvents, isEventFilter } from './EventTimeline';
import { readPersisted, PERSIST_KEYS } from './persist';
import { clearWorldCache, createWorldClient } from '../../world-client';
import { isWorldFilter } from './WorldTab';
import type { EventRow } from './EventPanels';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const prod = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), `src/macro-center/src/__fixtures__/world-prod-2026-11-19/${f}.json`), 'utf8'));
const SERIES = prod('series');
const USD = prod('scenario-usd-strong-h3');
const EVENTS: EventRow[] = prod('events').events;

const mount = async (node: React.ReactNode) => {
  const el = document.createElement('div'); el.className = 'wd'; document.body.appendChild(el);
  await act(async () => { createRoot(el).render(node); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
};

beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } clearWorldCache(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('W1 so sánh kịch bản', () => {
  it('mức màu chỉ cho ô kết luận được hướng', () => {
    expect(heatLevel(-13.3, true)).toBe(3);
    expect(heatLevel(-4.5, true)).toBe(2);
    expect(heatLevel(1.2, true)).toBe(1);
    expect(heatLevel(-4.6, false)).toBe(0);
  });
  it('bảng nhiệt: mỗi kịch bản một cột, ô chưa kết luận có "?", bấm ô mở kịch bản đó', async () => {
    const usd = USD, oil = { ...USD, scenario: { ...USD.scenario, id: 'oil-spike', nameVi: 'Giá dầu tăng mạnh' }, sectors: USD.sectors.map((s: { est: number }) => ({ ...s, est: -s.est })) };
    const scenario = vi.fn(async (b: { scenarioId: string }) => (b.scenarioId === 'oil-spike' ? oil : b.scenarioId === 'usd-strong' ? usd : Promise.reject(new Error('Lỗi 500'))));
    const client = { scenario } as unknown as ReturnType<typeof createWorldClient>;
    const onPick = vi.fn();
    window.localStorage.setItem(PERSIST_KEYS.scenarioCompare, JSON.stringify(['usd-strong', 'oil-spike', 'fed-cut']));
    const el = await mount(<ScenarioCompare client={client} scenarios={SERIES.scenarios} horizon={3} onPick={onPick} />);
    expect(scenario).toHaveBeenCalledTimes(3);
    const heads = [...el.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(heads.join('|')).toMatch(/USD mạnh lên.*Giá dầu tăng mạnh.*Fed giảm lãi suất.*lỗi/);
    const sec = el.querySelector('[data-testid="heat-usd-strong-S_SEC"]')!;
    expect(sec.textContent).toBe('−13,3%');
    expect(sec.getAttribute('data-level')).toBe('3');
    const steel = el.querySelector('[data-testid="heat-usd-strong-S_STEEL"]')!;
    expect(steel.textContent).toContain('?'); expect(steel.getAttribute('data-level')).toBe('0');
    await act(async () => { (sec as HTMLButtonElement).click(); });
    expect(onPick).toHaveBeenCalledWith('usd-strong', 'S_SEC');
  });
  it('tối đa 4 kịch bản; lựa chọn được nhớ', async () => {
    const client = { scenario: vi.fn(async () => USD) } as unknown as ReturnType<typeof createWorldClient>;
    const el = await mount(<ScenarioCompare client={client} scenarios={SERIES.scenarios} horizon={3} onPick={() => {}} />);
    expect(DEFAULT_COMPARE).toHaveLength(4);
    expect((el.querySelector('[data-testid="compare-chip-tariff-up"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (el.querySelector('[data-testid="compare-chip-fed-cut"]') as HTMLButtonElement).click(); });
    expect(JSON.parse(window.localStorage.getItem(PERSIST_KEYS.scenarioCompare)!)).toEqual(['usd-strong', 'oil-spike', 'risk-off']);
  });
  it('ngành bất ổn (vượt ±50% trong 3 tháng) hiện "bất ổn", không tô màu, không hiện số', async () => {
    const bad = { ...USD, sectors: USD.sectors.map((s: { sector: string }) => (s.sector === 'S_STEEL' ? { ...s, est: 98, lo: 58.8, hi: 137.2, conclusive: false, unstable: true } : { ...s, unstable: false })) };
    const client = { scenario: vi.fn(async () => bad) } as unknown as ReturnType<typeof createWorldClient>;
    window.localStorage.setItem(PERSIST_KEYS.scenarioCompare, JSON.stringify(['oil-spike']));
    const el = await mount(<ScenarioCompare client={client} scenarios={SERIES.scenarios} horizon={3} onPick={() => {}} />);
    const c = el.querySelector('[data-testid="heat-oil-spike-S_STEEL"]')!;
    expect(c.textContent).toBe('bất ổn'); expect(c.getAttribute('data-unstable')).toBe('true'); expect(c.getAttribute('data-level')).toBe('0');
    expect(c.textContent).not.toContain('98');
  });
  it('gộp hàng theo ngành của mọi cột', () => {
    const rows = compareRows([{ id: 'a', nameVi: 'A', result: USD, error: null }, { id: 'b', nameVi: 'B', result: null, error: 'x' }]);
    expect(rows).toHaveLength(10); expect(rows[0].cells[1]).toBeNull();
  });
});

describe('W2 dòng thời gian sự kiện', () => {
  it('lọc theo khu vực / loại / bậc; bộ lọc hỏng trong bộ nhớ -> mặc định', () => {
    expect(filterEvents(EVENTS, DEFAULT_EVENT_FILTER)).toHaveLength(37);
    expect(filterEvents(EVENTS, { ...DEFAULT_EVENT_FILTER, region: 'CN' })).toHaveLength(1);
    expect(filterEvents(EVENTS, { ...DEFAULT_EVENT_FILTER, kind: 'surprise' })).toHaveLength(4);
    expect(filterEvents(EVENTS, { ...DEFAULT_EVENT_FILTER, tier: 'B' })).toHaveLength(1);
    window.localStorage.setItem(PERSIST_KEYS.eventFilter, '{"region":1}');
    expect(readPersisted(PERSIST_KEYS.eventFilter, DEFAULT_EVENT_FILTER, isEventFilter)).toEqual(DEFAULT_EVENT_FILTER);
    window.localStorage.setItem(PERSIST_KEYS.matrixFilter, '{bad json');
    expect(readPersisted(PERSIST_KEYS.matrixFilter, null, isWorldFilter)).toBeNull();
  });
  it('mỗi sự kiện có phiên là một điểm bấm được (chuột + bàn phím); sự kiện chờ đo được đếm riêng', async () => {
    const onSelect = vi.fn();
    const el = await mount(<EventTimeline events={EVENTS} selected={null} onSelect={onSelect} />);
    const pts = el.querySelectorAll('[data-testid^="tl-"]');
    expect(pts.length).toBe(EVENTS.filter((e) => e.sessionDate).length);
    expect(el.textContent).toContain('1 sự kiện chưa có phiên phản ứng');
    const first = pts[0] as SVGGElement;
    expect(first.getAttribute('aria-label')).toMatch(/^\d{4}-\d{2}-\d{2}: /);
    await act(async () => { first.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('W4 bộ đệm world-client', () => {
  const okRes = (v: unknown) => ({ ok: true, status: 200, json: async () => v }) as Response;
  it('gọi trùng dùng chung một yêu cầu; lỗi không bị đệm; người gọi huỷ không làm hỏng bản đệm', async () => {
    const f = vi.fn(async () => okRes({ events: [], family: 'x' }));
    const c = createWorldClient('https://gw', f, { cache: true });
    await Promise.all([c.events(), c.events()]);
    expect(f).toHaveBeenCalledTimes(1);
    const ctrl = new AbortController();
    const p = c.matrix({}, ctrl.signal); ctrl.abort();
    await expect(p).rejects.toThrow();
    await c.matrix({}); expect(f).toHaveBeenCalledTimes(2);
    let fail = true;
    const g = vi.fn(async () => (fail ? ({ ok: false, status: 503, json: async () => ({ error: 'bận' }) } as Response) : okRes({ ok: 1 })));
    const c2 = createWorldClient('https://gw2', g, { cache: true });
    await expect(c2.overview()).rejects.toThrow('bận');
    fail = false; await c2.overview(); expect(g).toHaveBeenCalledTimes(2);
  });
  it('hết hạn sau 5 phút; client có fetch tiêm vào mặc định không đệm', async () => {
    let t = 0;
    const f = vi.fn(async () => okRes({}));
    const c = createWorldClient('https://gw3', f, { cache: true, now: () => t });
    await c.series(); t += 4 * 60_000; await c.series(); expect(f).toHaveBeenCalledTimes(1);
    t += 2 * 60_000; await c.series(); expect(f).toHaveBeenCalledTimes(2);
    const h = vi.fn(async () => okRes({}));
    const c2 = createWorldClient('https://gw4', h);
    await c2.series(); await c2.series(); expect(h).toHaveBeenCalledTimes(2);
  });
});
