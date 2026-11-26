// pa-book-2 (26/11/2026) — lớp setup theo công thức chiến lược của sách (Tập 2 "Các bước thiết lập một chiến lược Price Action"):
//   nhận định xu hướng → vùng tiềm năng (hỗ trợ/kháng cự) → mẫu hình → vào khi setup bị phá vỡ → cắt lỗ dưới mẫu hình →
//   thoát tại kháng cự gần nhất; "nếu (kháng cự − entry)/(entry − stop) không đạt 2:1 hoặc 1.5:1 thì bỏ qua".
// - Đảo chiều (pin, nến đảo chiều, đảo chiều chủ chốt, đuối sức, 2 thanh, 3 thanh): phải chạm vùng hỗ trợ (mua) / kháng cự (bán) đang hiệu lực.
// - Tiếp diễn (inside bar, NR7, 3 nến hồi): chỉ theo xu hướng cấu trúc đang có (sách: "trade kiểu tiếp diễn xu hướng").
// - Khối lượng (sách): breakout thật kèm volume tăng vọt; volume phải đồng thuận xu hướng -> ghi ở setup.volume, KHÔNG chặn setup
//   (để đo riêng đóng góp của khối lượng — kiểm định PA-VOL-r1).
// Mọi vùng / xu hướng đọc theo phiên (không nhìn trước). Một setup cho mỗi (hướng, nhóm, phiên mẫu hình): nhiều mẫu hình cùng phiên gộp lại.
import { isLimitLocked, tickAt } from "./math.ts";
import type { Bar, CandleFeature, Direction, PASetup, PAPattern, PAZone, PASwing, PatternId, SetupKind, TrendState, VolumeFeature } from "./types.ts";
import { atrOf, liveZonesAt, zoneOverlapsBar, zoneStateAt } from "./zones.ts";

export interface SetupBuildOptions {
  limitPct: number | null;
  maxAgeBars: number;
  breakoutBufferTicks: number;
  minRewardRisk: number;
  breakoutRvol: number;
  trendRatioMin: number;
  customTickSize?: (price: number) => number;
}

/** Ưu tiên khi nhiều mẫu hình đảo chiều trùng phiên (mạnh/ít mơ hồ trước). */
const REVERSAL_PRIORITY: PatternId[] = ["KEY_REVERSAL_BAR", "THREE_BAR_REVERSAL", "TWO_BAR_REVERSAL", "PIN_BAR", "EXHAUSTION_CANDIDATE", "REVERSAL_BAR"];
const CONTINUATION_PRIORITY: PatternId[] = ["THREE_BAR_PULLBACK", "INSIDE_BAR", "NR7"];

export function buildSetups(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  volumes: readonly VolumeFeature[],
  patterns: readonly PAPattern[],
  zones: readonly PAZone[],
  swings: readonly PASwing[],
  trend: readonly { state: TrendState; broken: boolean }[],
  options: SetupBuildOptions,
): PASetup[] {
  const setups: PASetup[] = [];
  const byIndex = new Map<number, PAPattern[]>();
  for (const p of patterns) {
    if (p.role === "context") continue;
    const l = byIndex.get(p.confirmedIndex) ?? []; l.push(p); byIndex.set(p.confirmedIndex, l);
  }
  let sequence = 0;
  const buffer = (i: number) => Math.max(2 * tickAt(bars[i].close, options.customTickSize), 0.1 * atrOf(features[i]));

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    // 1) Tiến trình các setup đang hình thành.
    for (const s of setups) {
      if (s.state !== "forming" || i <= s.confirmedIndex) continue;
      if (s.zoneId) {
        const zone = zones.find((z) => z.id === s.zoneId)!;
        const st = zoneStateAt(zone, i);
        if (st === "broken" || st === "expired") { transition(s, i, bar.date, "invalidated", st === "broken" ? "Vùng bị phá trước khi kích hoạt" : "Vùng hết hiệu lực"); continue; }
      }
      const stop = s.invalidationLevel!;
      if (s.direction === "bullish" ? bar.close < stop : bar.close > stop) { transition(s, i, bar.date, "invalidated", "Đóng cửa vượt mức vô hiệu trước khi kích hoạt"); continue; }
      const trig = s.entryReference!;
      if (s.direction === "bullish" ? bar.close > trig : bar.close < trig) {
        const target = targetAt(s.direction, bar.close, zones, swings, i);
        s.targetReferences = target ? [target] : [];
        rr(s, options.minRewardRisk);
        s.trendAtTrigger = trend[i]?.state ?? null;
        const v = volumes[i];
        s.volume.triggerRvol = v?.rvol ?? null;
        s.volume.upDownRatio = v?.upDownRatio ?? null;
        s.volume.confirmed = v?.rvol == null || v.upDownRatio == null ? null
          : s.direction === "bullish" ? v.rvol >= options.breakoutRvol && v.upDownRatio >= options.trendRatioMin
            : v.rvol >= options.breakoutRvol && v.upDownRatio <= 1 / Math.max(options.trendRatioMin, 1e-9);
        s.missingConditions = [];
        transition(s, i, bar.date, "triggered", "Đóng cửa vượt mức kích hoạt của mẫu hình");
        continue;
      }
      if (i - s.confirmedIndex >= options.maxAgeBars) transition(s, i, bar.date, "expired", "Không kích hoạt trong thời hạn setup");
    }

    // 2) Setup mới từ mẫu hình xác nhận tại phiên i.
    const list = byIndex.get(i);
    if (!list || isLimitLocked(bars, i, options.limitPct)) continue;
    const t = trend[i]?.state ?? "undetermined";
    for (const direction of ["bullish", "bearish"] as Direction[]) {
      // Đảo chiều tại vùng.
      const rev = REVERSAL_PRIORITY.flatMap((id) => list.filter((p) => p.id === id && p.role === "reversal" && p.direction === direction));
      if (rev.length) {
        const role = direction === "bullish" ? "support" : "resistance";
        const span = { low: Math.min(...rev.map((p) => p.priceLow)), high: Math.max(...rev.map((p) => p.priceHigh)) };
        const zone = liveZonesAt(zones, i, role)
          .filter((z) => zoneOverlapsBar(z, { ...bar, low: span.low, high: span.high }))
          .sort((a, b) => Math.abs(a.mid - bar.close) - Math.abs(b.mid - bar.close) || a.zone.confirmedIndex - b.zone.confirmedIndex)[0];
        if (zone) setups.push(make(rev, direction === "bullish" ? "REVERSAL_AT_SUPPORT" : "REVERSAL_AT_RESISTANCE", zone.zone.id, `vùng ${role === "support" ? "hỗ trợ" : "kháng cự"} ${zone.zone.id}`));
      }
      // Tiếp diễn theo xu hướng.
      const trendDir = t === "bullish" ? "bullish" : t === "bearish" ? "bearish" : null;
      if (trendDir === direction) {
        const cont = CONTINUATION_PRIORITY.flatMap((id) => list.filter((p) => p.id === id && p.role === "continuation" && (p.direction === direction || p.direction === "two_sided")));
        if (cont.length) setups.push(make(cont, "CONTINUATION_IN_TREND", null, `xu hướng ${direction === "bullish" ? "tăng" : "giảm"}`));
      }

      function make(ps: PAPattern[], kind: SetupKind, zoneId: string | null, where: string): PASetup {
        const p = ps[0];
        const ticks = options.breakoutBufferTicks * tickAt(p.triggerLevel ?? bar.close, options.customTickSize);
        const entry = direction === "bullish" ? (p.triggerLevel ?? p.priceHigh) + ticks : (p.triggerLevel ?? p.priceLow) - ticks;
        const stop = direction === "bullish" ? (p.stopLevel ?? p.priceLow) - buffer(i) : (p.stopLevel ?? p.priceHigh) + buffer(i);
        const target = targetAt(direction, entry, zones, swings, i);
        const s: PASetup = {
          id: `pa-setup-${++sequence}`, kind, patternId: p.id, direction, state: "forming",
          originIndex: p.originIndex, confirmedIndex: i, originDate: p.originDate, confirmedDate: p.confirmedDate,
          stateIndex: i, stateDate: bar.date, stateReason: `${p.id} tại ${where}`,
          entryReference: entry, invalidationLevel: stop, targetReferences: target ? [target] : [],
          riskDistance: null, rewardRisk: null, rewardRiskOk: null, trendAtTrigger: null,
          volume: { patternRvol: volumes[i]?.rvol ?? null, triggerRvol: null, upDownRatio: null, confirmed: null },
          zoneId,
          evidence: [...new Set(ps.map((x) => `${x.id}:${String(x.evidence.definition ?? "")}`))],
          missingConditions: [`Chờ giá đóng cửa ${direction === "bullish" ? "trên" : "dưới"} mức kích hoạt trong ${options.maxAgeBars} phiên`,
            ...(!options.customTickSize ? ["Chưa có bước giá theo sàn: đệm kích hoạt = 0"] : [])],
          provenance: "INFERRED",
        };
        rr(s, options.minRewardRisk);
        return s;
      }
    }
  }
  return setups;
}

function rr(s: PASetup, minRewardRisk: number) {
  const entry = s.entryReference, stop = s.invalidationLevel, target = s.targetReferences[0]?.price;
  s.riskDistance = entry != null && stop != null && entry !== stop ? Math.abs(entry - stop) : null;
  s.rewardRisk = s.riskDistance && target != null ? (s.direction === "bullish" ? target - entry! : entry! - target) / s.riskDistance : null;
  s.rewardRiskOk = s.rewardRisk == null ? null : s.rewardRisk >= minRewardRisk;
}

function transition(setup: PASetup, index: number, date: string, state: PASetup["state"], reason: string): void {
  setup.state = state;
  setup.stateIndex = index;
  setup.stateDate = date;
  setup.stateReason = reason;
}

/** Sách: thoát tại kháng cự gần nhất (mua) — mép gần của vùng kháng cự đang hiệu lực; không có vùng -> swing high đã xác nhận gần nhất. */
export function targetAt(direction: Direction, from: number, zones: readonly PAZone[], swings: readonly PASwing[], index: number): { price: number; basis: string } | null {
  const role = direction === "bullish" ? "resistance" : "support";
  const z = liveZonesAt(zones, index, role)
    .map((x) => ({ edge: direction === "bullish" ? x.low : x.high, x }))
    .filter(({ edge }) => (direction === "bullish" ? edge > from : edge < from))
    .sort((a, b) => Math.abs(a.edge - from) - Math.abs(b.edge - from))[0];
  if (z) return { price: z.edge, basis: `vùng ${role === "resistance" ? "kháng cự" : "hỗ trợ"} ${z.x.zone.id}` };
  const sw = swings
    .filter((c) => c.confirmedIndex <= index && c.kind === (direction === "bullish" ? "high" : "low") && (direction === "bullish" ? c.price > from : c.price < from))
    .sort((a, b) => Math.abs(a.price - from) - Math.abs(b.price - from))[0];
  return sw ? { price: sw.price, basis: "swing đã xác nhận gần nhất" } : null;
}
