import { describe, expect, it } from 'vitest';
import { useAppStore } from './useAppStore';
import type { RadarCoreNode, RadarRingNode } from '../types';

describe('updateRadarPrices', () => {
  it('thay giá mẫu của Radar bằng giá thật và đánh dấu livePrice', () => {
    useAppStore.setState({
      radarCore: [{ ticker: 'VNM', price: 68400, changePct: 1.2 } as RadarCoreNode],
      radarRing: [{ ticker: 'VCB', price: 92100, changePct: 0.6 } as RadarRingNode, { ticker: 'TCB', price: 38200, changePct: 0.5 } as RadarRingNode],
    });
    useAppStore.getState().updateRadarPrices({ VNM: { price: 58500, changePct: -1.4 }, VCB: { price: 57500, changePct: null }, HPG: { price: 20050, changePct: -0.5 } });
    const { radarCore, radarRing } = useAppStore.getState();
    expect(radarCore[0]).toMatchObject({ price: 58500, changePct: -1.4, livePrice: true });
    expect(radarRing[0]).toMatchObject({ price: 57500, changePct: 0.6, livePrice: true });
    expect(radarRing[1].livePrice).toBeUndefined();
  });
});
