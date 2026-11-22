import { isLimitLocked, tickAt } from "./math.ts";
import type { Bar, CandleFeature, PASetup, PAZone, PASwing, PAPattern } from "./types.ts";
import { zoneOverlapsBar, zoneRoleAt, zoneStateAt } from "./zones.ts";

export interface SetupBuildOptions {
  limitPct: number | null;
  maxAgeBars: number;
  breakoutBufferTicks: number;
  customTickSize?: (price: number) => number;
}

export function buildPinRejectionSetups(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  patterns: readonly PAPattern[],
  zones: readonly PAZone[],
  swings: readonly PASwing[],
  options: SetupBuildOptions,
): PASetup[] {
  const setups: PASetup[] = [];
  const pinsByIndex = new Map<number, PAPattern[]>();
  for (const pattern of patterns) {
    if (pattern.id !== "PIN_BAR") continue;
    const list = pinsByIndex.get(pattern.confirmedIndex) ?? [];
    list.push(pattern);
    pinsByIndex.set(pattern.confirmedIndex, list);
  }
  let sequence = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const tick = tickAt(bar.close, options.customTickSize);
    const atr = features[i].rangeAtr !== null && features[i].rangeAtr! > 0
      ? features[i].range / features[i].rangeAtr!
      : 0;
    const buffer = Math.max(2 * tick, 0.1 * atr);
    const locked = isLimitLocked(bars, i, options.limitPct);

    for (const setup of setups) {
      if (setup.state !== "forming" || i <= setup.confirmedIndex) continue;
      const zone = zones.find((candidate) => candidate.id === setup.evidence[0]);
      if (!zone) {
        transition(setup, i, bar.date, "invalidated", "Zone nguồn không còn tồn tại");
        continue;
      }
      const zoneState = zoneStateAt(zone, i);
      const zoneRole = zoneRoleAt(zone, i);
      if (zoneState === "broken" || zoneState === "expired") {
        transition(setup, i, bar.date, "invalidated", `Zone ${zoneState}`);
        continue;
      }

      const invalidated = setup.direction === "bullish"
        ? bar.close < (setup.invalidationLevel ?? -Infinity)
        : bar.close > (setup.invalidationLevel ?? Infinity);
      if (invalidated) {
        transition(setup, i, bar.date, "invalidated", "Đóng cửa vượt mức vô hiệu hóa trước trigger");
        continue;
      }

      const candidatePattern = patterns.find((pattern) => pattern.id === "PIN_BAR"
        && pattern.confirmedIndex === setup.confirmedIndex
        && pattern.direction === setup.direction);
      if (!locked && candidatePattern) {
        const triggerTick = tickAt(
          setup.direction === "bullish" ? candidatePattern.priceHigh : candidatePattern.priceLow,
          options.customTickSize,
        );
        if (triggerTick > 0) {
          const triggerPrice = setup.direction === "bullish"
            ? candidatePattern.priceHigh + options.breakoutBufferTicks * triggerTick
            : candidatePattern.priceLow - options.breakoutBufferTicks * triggerTick;
          const triggered = setup.direction === "bullish" ? bar.close > triggerPrice : bar.close < triggerPrice;
          if (triggered) {
            setup.entryReference = triggerPrice;
            setup.riskDistance = setup.invalidationLevel === null ? null : Math.abs(triggerPrice - setup.invalidationLevel);
            setup.targetReferences = targetReferences(setup.direction, bar.close, zones, swings, i);
            transition(setup, i, bar.date, "triggered", "Đóng cửa vượt ngưỡng trigger đã cấu hình");
            continue;
          }
        }
      }

      if (i - setup.confirmedIndex > options.maxAgeBars) {
        transition(setup, i, bar.date, "expired", "Không trigger trong thời hạn setup");
      }
      if (zoneRole !== (setup.direction === "bullish" ? "support" : "resistance")) {
        transition(setup, i, bar.date, "invalidated", "Zone đã đổi vai trò");
      }
    }

    for (const pattern of pinsByIndex.get(i) ?? []) {
      if (locked || (pattern.direction !== "bullish" && pattern.direction !== "bearish")) continue;
      const role = pattern.direction === "bullish" ? "support" : "resistance";
      const zone = zones
        .filter((candidate) => candidate.kind === role
          && zoneRoleAt(candidate, i) === role
          && (zoneStateAt(candidate, i) === "active" || zoneStateAt(candidate, i) === "flipped")
          && zoneOverlapsBar(candidate, bar))
        .sort((a, b) => Math.abs(a.mid - bar.close) - Math.abs(b.mid - bar.close)
          || a.confirmedIndex - b.confirmedIndex)[0];
      if (!zone) continue;

      const invalidationLevel = pattern.direction === "bullish"
        ? zone.low - buffer
        : zone.high + buffer;
      setups.push({
        id: `pa-setup-${++sequence}`,
        kind: "PIN_REJECTION_AT_ZONE",
        direction: pattern.direction,
        state: "forming",
        originIndex: pattern.originIndex,
        confirmedIndex: i,
        originDate: pattern.originDate,
        confirmedDate: pattern.confirmedDate,
        stateIndex: i,
        stateDate: bar.date,
        stateReason: "Pin bar đã xác nhận tại zone active",
        entryReference: null,
        invalidationLevel,
        targetReferences: [],
        riskDistance: null,
        evidence: [zone.id, pattern.id, "zone-overlap", "active-zone"],
        missingConditions: [
          "Chờ close vượt high/low của pin bar kèm buffer",
          ...(!options.customTickSize ? ["Cần cấu hình tick size theo thị trường để xác định trigger"] : []),
        ],
        provenance: "INFERRED",
      });
    }
  }
  return setups;
}

function transition(setup: PASetup, index: number, date: string, state: PASetup["state"], reason: string): void {
  setup.state = state;
  setup.stateIndex = index;
  setup.stateDate = date;
  setup.stateReason = reason;
}

function targetReferences(
  direction: PASetup["direction"],
  close: number,
  zones: readonly PAZone[],
  swings: readonly PASwing[],
  index: number,
): PASetup["targetReferences"] {
  const oppositeRole = direction === "bullish" ? "resistance" : "support";
  const zoneTarget = zones
    .filter((zone) => zone.kind === oppositeRole
      && zoneRoleAt(zone, index) === oppositeRole
      && (zoneStateAt(zone, index) === "active" || zoneStateAt(zone, index) === "flipped")
      && (direction === "bullish" ? zone.mid > close : zone.mid < close))
    .sort((a, b) => Math.abs(a.mid - close) - Math.abs(b.mid - close))[0];
  if (zoneTarget) return [{ price: zoneTarget.mid, basis: `active-${oppositeRole}-zone` }];

  const swing = swings
    .filter((candidate) => candidate.confirmedIndex <= index
      && candidate.kind === (direction === "bullish" ? "high" : "low")
      && (direction === "bullish" ? candidate.price > close : candidate.price < close))
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))[0];
  return swing ? [{ price: swing.price, basis: "nearest-confirmed-swing" }] : [];
}
