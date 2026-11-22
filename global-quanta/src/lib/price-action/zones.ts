import { candleCloseLocation, isLimitLocked, roundPrice, tickAt } from "./math.ts";
import type { Bar, CandleFeature, PAZone, PASwing, ZoneState } from "./types.ts";

function setState(zone: PAZone, index: number, date: string, state: ZoneState, role: PAZone["role"], reason: string): void {
  if (zone.state === state && zone.role === role) return;
  zone.state = state;
  zone.role = role;
  zone.kind = role;
  zone.stateIndex = index;
  zone.stateEvents.push({ index, date, state, role, reason });
}

function updateStrength(zone: PAZone, currentIndex: number, maxAgeBars: number): void {
  zone.strengthComponents = {
    touches: Math.min(1, zone.touches / 5),
    recency: Math.max(0, 1 - (currentIndex - zone.confirmedIndex) / maxAgeBars),
    rejection: Math.min(1, zone.rejections / Math.max(1, zone.touches)),
    confluence: 0,
  };
}

export interface ZoneBuildOptions {
  atrTolerance: number;
  minTouches: number;
  maxAgeBars: number;
  rejectionCloseLoc: number;
  limitPct: number | null;
  customTickSize?: (price: number) => number;
}

export function buildPriceActionZones(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  swings: readonly PASwing[],
  options: ZoneBuildOptions,
): PAZone[] {
  const zones: PAZone[] = [];
  const pivotsByConfirmation = new Map<number, PASwing[]>();
  for (const swing of swings) {
    const list = pivotsByConfirmation.get(swing.confirmedIndex) ?? [];
    list.push(swing);
    pivotsByConfirmation.set(swing.confirmedIndex, list);
  }

  const inside = new Map<string, boolean>();
  const lastTouchIndex = new Map<string, number>();
  const flipRetestPending = new Set<string>();
  let sequence = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const atr = features[i].rangeAtr !== null && features[i].rangeAtr! > 0
      ? features[i].range / features[i].rangeAtr!
      : 0;
    const tick = tickAt(bar.close, options.customTickSize);
    const breakBuffer = Math.max(2 * tick, 0.1 * atr);
    const locked = isLimitLocked(bars, i, options.limitPct);

    for (const zone of zones) {
      if (zone.state === "broken" && flipRetestPending.has(zone.id)) {
        const overlap = bar.low <= zone.high && bar.high >= zone.low;
        const flippedClose = zone.role === "resistance" ? bar.close > zone.high : bar.close < zone.low;
        if (overlap && flippedClose) {
          const newRole = zone.role === "resistance" ? "support" : "resistance";
          setState(zone, i, bar.date, "flipped", newRole, "Retest và đóng cửa ở phía mới của vùng");
          flipRetestPending.delete(zone.id);
        }
      }
      if (zone.state === "broken" || zone.state === "expired") continue;

      const overlap = bar.low <= zone.high && bar.high >= zone.low;
      const wasInside = inside.get(zone.id) ?? false;
      const newTouch = overlap && !wasInside && i > zone.confirmedIndex;
      if (newTouch) {
        zone.touches++;
        lastTouchIndex.set(zone.id, i);
      }
      inside.set(zone.id, overlap);

      if (newTouch) {
        const closeLoc = candleCloseLocation(bar.high, bar.low, bar.close);
        const rejection = zone.role === "support"
          ? bar.close > zone.high && closeLoc !== null && closeLoc >= options.rejectionCloseLoc
          : bar.close < zone.low && closeLoc !== null && closeLoc <= 1 - options.rejectionCloseLoc;
        if (rejection) zone.rejections++;
        if (zone.touches >= options.minTouches && zone.state === "developing") {
          setState(zone, i, bar.date, "active", zone.role, "Đủ số lần chạm độc lập tối thiểu");
        }
      }

      if (!locked) {
        const broke = zone.role === "support"
          ? bar.close < zone.low - breakBuffer
          : bar.close > zone.high + breakBuffer;
        if (broke) {
          zone.breaks++;
          setState(zone, i, bar.date, "broken", zone.role, "Đóng cửa vượt biên vùng kèm buffer");
          flipRetestPending.add(zone.id);
          continue;
        }
      }

      if ((zone.state === "developing" || zone.state === "active" || zone.state === "flipped")
        && i - zone.confirmedIndex > options.maxAgeBars) {
        setState(zone, i, bar.date, "expired", zone.role, "Vượt quá tuổi tối đa của vùng");
      }
      updateStrength(zone, i, options.maxAgeBars);
    }

    for (const swing of pivotsByConfirmation.get(i) ?? []) {
      const role: PAZone["role"] = swing.kind === "low" ? "support" : "resistance";
      const tol = Math.max(options.atrTolerance * atr, 2 * tickAt(swing.price, options.customTickSize));
      const candidates = zones
        .filter((zone) => zone.role === role && zone.state !== "broken" && zone.state !== "expired")
        .map((zone) => ({ zone, distance: Math.abs(swing.price - zone.mid) / Math.max(atr, tick, Number.EPSILON) }))
        .filter(({ zone }) => Math.abs(swing.price - zone.mid) <= tol)
        .sort((a, b) => a.distance - b.distance || a.zone.confirmedIndex - b.zone.confirmedIndex);
      const target = candidates[0]?.zone;
      if (target) {
        target.low = roundPrice(Math.min(target.low, swing.price));
        target.high = roundPrice(Math.max(target.high, swing.price));
        target.mid = roundPrice((target.low + target.high) / 2);
        if (lastTouchIndex.get(target.id) !== i) {
          target.touches++;
          lastTouchIndex.set(target.id, i);
        }
        if (target.touches >= options.minTouches && target.state === "developing") {
          setState(target, i, bar.date, "active", target.role, "Có đủ pivot độc lập trong dung sai zone");
        }
        updateStrength(target, i, options.maxAgeBars);
      } else {
        const zone: PAZone = {
          id: `pa-zone-${++sequence}`,
          kind: role,
          role,
          low: swing.price,
          high: swing.price,
          mid: swing.price,
          touches: 1,
          rejections: 0,
          breaks: 0,
          state: "developing",
          stateIndex: null,
          originIndex: swing.originIndex,
          confirmedIndex: swing.confirmedIndex,
          originDate: swing.originDate,
          confirmedDate: swing.confirmedDate,
          strengthComponents: { touches: 0.2, recency: 1, rejection: 0, confluence: 0 },
          stateEvents: [{ index: i, date: bar.date, state: "developing", role, reason: "Pivot đầu tiên của zone" }],
        };
        zones.push(zone);
        lastTouchIndex.set(zone.id, i);
      }
    }
  }
  return zones;
}

export function zoneStateAt(zone: PAZone, index: number): ZoneState | null {
  let state: ZoneState | null = null;
  for (const event of zone.stateEvents) {
    if (event.index > index) break;
    state = event.state;
  }
  return state;
}

export function zoneRoleAt(zone: PAZone, index: number): PAZone["role"] {
  let role = zone.stateEvents[0]?.role ?? zone.role;
  for (const event of zone.stateEvents) {
    if (event.index > index) break;
    role = event.role;
  }
  return role;
}

export function zoneOverlapsBar(zone: PAZone, bar: Bar): boolean {
  return bar.low <= zone.high && bar.high >= zone.low;
}

export function zoneRejectionCloseLoc(bar: Bar): number | null {
  return candleCloseLocation(bar.high, bar.low, bar.close);
}
