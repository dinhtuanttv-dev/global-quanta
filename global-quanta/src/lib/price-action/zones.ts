// pa-book-2 (26/11/2026) — vùng hỗ trợ/kháng cự PA dựng ONLINE từ swing đã xác nhận (sách: "nối các swing high, swing low nằm ngang"),
// có vòng đời developing → active → broken → flipped ("hỗ trợ chuyển thành kháng cự và ngược lại") → expired.
// Sửa lỗi nhìn trước của pa-v1: setup/target đọc biên `low/high/mid` và `kind` CUỐI CÙNG của vùng (sau khi cả lịch sử đã chạy) —
// vùng được mở rộng/đổi vai sau này rò vào quá khứ, và vùng về sau đổi vai bị loại khỏi setup cũ (chọn lọc theo kết quả).
// Nay mọi truy vấn theo phiên dùng zoneBoundsAt / zoneStateAt / zoneRoleAt. Hết hạn tính từ lần chạm gần nhất (không phải ngày sinh);
// một pivot thuộc lần chạm đã đếm không bị đếm lại.
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
    recency: Math.max(0, 1 - (currentIndex - zone.lastTouchIndex) / maxAgeBars),
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

export function atrOf(feature: CandleFeature): number {
  return feature.atr !== null && feature.atr > 0 ? feature.atr : 0;
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
  /** Phiên bắt đầu của lần chạm đang diễn ra / gần nhất — pivot nằm trong lần chạm đó không đếm thêm. */
  const touchStart = new Map<string, number>();
  const flipRetestPending = new Set<string>();
  let sequence = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const atr = atrOf(features[i]);
    const tick = tickAt(bar.close, options.customTickSize);
    const breakBuffer = Math.max(2 * tick, 0.1 * atr);
    const locked = isLimitLocked(bars, i, options.limitPct);

    for (const zone of zones) {
      const overlap = bar.low <= zone.high && bar.high >= zone.low;
      if (zone.state === "broken" && flipRetestPending.has(zone.id)) {
        const flippedClose = zone.role === "resistance" ? bar.close > zone.high : bar.close < zone.low;
        if (overlap && flippedClose) {
          const newRole = zone.role === "resistance" ? "support" : "resistance";
          setState(zone, i, bar.date, "flipped", newRole, "Retest và đóng cửa ở phía mới của vùng");
          flipRetestPending.delete(zone.id);
          zone.lastTouchIndex = i;
          inside.set(zone.id, true);
          continue;
        }
      }
      if (zone.state === "broken" || zone.state === "expired") { inside.set(zone.id, overlap); continue; }

      const wasInside = inside.get(zone.id) ?? false;
      const newTouch = overlap && !wasInside && i > zone.confirmedIndex;
      inside.set(zone.id, overlap);
      if (newTouch) {
        zone.touches++;
        zone.lastTouchIndex = i;
        touchStart.set(zone.id, i);
        const closeLoc = candleCloseLocation(bar.high, bar.low, bar.close);
        const rejection = zone.role === "support"
          ? bar.close > zone.high && closeLoc !== null && closeLoc >= options.rejectionCloseLoc
          : bar.close < zone.low && closeLoc !== null && closeLoc <= 1 - options.rejectionCloseLoc;
        if (rejection) zone.rejections++;
        if (zone.touches >= options.minTouches && zone.state === "developing") {
          setState(zone, i, bar.date, "active", zone.role, "Đủ số lần chạm độc lập tối thiểu");
        }
      } else if (overlap) zone.lastTouchIndex = i;

      if (!locked) {
        const broke = zone.role === "support" ? bar.close < zone.low - breakBuffer : bar.close > zone.high + breakBuffer;
        if (broke) {
          zone.breaks++;
          setState(zone, i, bar.date, "broken", zone.role, "Đóng cửa vượt biên vùng kèm đệm");
          flipRetestPending.add(zone.id);
          continue;
        }
      }

      if (i - zone.lastTouchIndex > options.maxAgeBars) {
        setState(zone, i, bar.date, "expired", zone.role, "Không được chạm lại trong thời hạn của vùng");
        continue;
      }
      updateStrength(zone, i, options.maxAgeBars);
    }

    for (const swing of pivotsByConfirmation.get(i) ?? []) {
      const role: PAZone["role"] = swing.kind === "low" ? "support" : "resistance";
      const tol = Math.max(options.atrTolerance * atr, 2 * tickAt(swing.price, options.customTickSize));
      const target = zones
        .filter((zone) => zone.role === role && zone.state !== "broken" && zone.state !== "expired" && Math.abs(swing.price - zone.mid) <= tol)
        .map((zone) => ({ zone, distance: Math.abs(swing.price - zone.mid) }))
        .sort((a, b) => a.distance - b.distance || a.zone.confirmedIndex - b.zone.confirmedIndex)[0]?.zone;
      if (target) {
        const low = roundPrice(Math.min(target.low, swing.price)), high = roundPrice(Math.max(target.high, swing.price));
        if (low !== target.low || high !== target.high) {
          target.low = low; target.high = high; target.mid = roundPrice((low + high) / 2);
          target.boundsEvents.push({ index: i, low, high });
        }
        // Pivot thuộc lần chạm đã đếm (bắt đầu từ trước phiên gốc của pivot) không phải lần thử độc lập mới.
        const start = touchStart.get(target.id);
        if (start === undefined || start > swing.originIndex) {
          target.touches++;
          touchStart.set(target.id, swing.originIndex);
        }
        target.lastTouchIndex = Math.max(target.lastTouchIndex, i);
        if (target.touches >= options.minTouches && target.state === "developing") {
          setState(target, i, bar.date, "active", target.role, "Có đủ pivot độc lập trong dung sai vùng");
        }
        updateStrength(target, i, options.maxAgeBars);
      } else {
        const zone: PAZone = {
          id: `pa-zone-${++sequence}`,
          kind: role, role,
          low: swing.price, high: swing.price, mid: swing.price,
          touches: 1, rejections: 0, breaks: 0,
          state: "developing", stateIndex: null,
          originIndex: swing.originIndex, confirmedIndex: swing.confirmedIndex,
          originDate: swing.originDate, confirmedDate: swing.confirmedDate,
          strengthComponents: { touches: 0.2, recency: 1, rejection: 0, confluence: 0 },
          stateEvents: [{ index: i, date: bar.date, state: "developing", role, reason: "Pivot đầu tiên của vùng" }],
          boundsEvents: [{ index: i, low: swing.price, high: swing.price }],
          lastTouchIndex: i,
        };
        zones.push(zone);
        touchStart.set(zone.id, swing.originIndex);
        inside.set(zone.id, bar.low <= zone.high && bar.high >= zone.low);
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

/** Biên vùng ĐÃ BIẾT tại phiên `index` (null nếu vùng chưa tồn tại). */
export function zoneBoundsAt(zone: PAZone, index: number): { low: number; high: number; mid: number } | null {
  let b: { low: number; high: number } | null = null;
  for (const event of zone.boundsEvents) {
    if (event.index > index) break;
    b = event;
  }
  return b ? { low: b.low, high: b.high, mid: (b.low + b.high) / 2 } : null;
}

/** Vùng đang hiệu lực (active / flipped) với vai trò `role` tại phiên `index`, kèm biên tại phiên đó. */
export function liveZonesAt(zones: readonly PAZone[], index: number, role: PAZone["role"]) {
  const out: { zone: PAZone; low: number; high: number; mid: number }[] = [];
  for (const zone of zones) {
    if (zone.confirmedIndex > index) continue;
    const st = zoneStateAt(zone, index);
    if ((st !== "active" && st !== "flipped") || zoneRoleAt(zone, index) !== role) continue;
    const b = zoneBoundsAt(zone, index);
    if (b) out.push({ zone, ...b });
  }
  return out;
}

export function zoneOverlapsBar(bounds: { low: number; high: number }, bar: Bar): boolean {
  return bar.low <= bounds.high && bar.high >= bounds.low;
}

export function zoneRejectionCloseLoc(bar: Bar): number | null {
  return candleCloseLocation(bar.high, bar.low, bar.close);
}
