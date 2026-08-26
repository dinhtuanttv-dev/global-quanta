import type { DrawnPrimitive, RectangleZone, Trendline } from "./DrawingManager";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "./detectors/smcDetector";
import type { VSASignal } from "./detectors/vsaDetector";
import type { PatternMatch } from "./types";

export interface SignalLogEntry {
  id: string; message: string; confidence: number | null;
  source: "user" | "ai"; dataQuality: "HARD_DATA" | "ESTIMATED"; createdAt: number;
}

export interface ActiveLayers {
  smc: boolean; vsa: boolean; wyckoff: boolean; elliott: boolean;
}

function overlaps(aTop: number, aBottom: number, bTop: number, bBottom: number): boolean {
  return aTop >= bBottom && bTop >= aBottom;
}

export class AIEngine {
  private idCounter = 0;

  analyzeAndCrossReference(
    primitive: DrawnPrimitive,
    smc: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] },
    vsa: VSASignal[],
    currentPrice: number
  ): SignalLogEntry[] {
    const entries: SignalLogEntry[] = [];

    if (primitive.toolType === "rectangle") {
      const zone = primitive as RectangleZone;
      const top = Math.max(zone.p1.price, zone.p2.price);
      const bottom = Math.min(zone.p1.price, zone.p2.price);
      const classification = currentPrice > top ? "Ho tro" : currentPrice < bottom ? "Khang cu" : "Trung tinh";

      const matchedOB = smc.obs.find((ob) => overlaps(top, bottom, ob.top, ob.bottom));
      const matchedVSA = vsa.find((v) => v.date >= zone.p1.date && v.date <= zone.p2.date);

      let confidence = 40;
      const reasons: string[] = [];
      if (matchedOB) { confidence += 30; reasons.push(`trung Order Block ${matchedOB.type}`); }
      if (matchedVSA) { confidence += 20; reasons.push(`VSA xac nhan (${matchedVSA.type})`); }
      confidence = Math.min(99, confidence);

      const message = reasons.length > 0
        ? `Demand/Supply Zone (User) -> AI xac nhan (${confidence}%) - ${reasons.join(", ")}.`
        : `Vung ${classification} (User) - chua co xac nhan cheo tu SMC/VSA (${confidence}%).`;

      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now() });
    }

    if (primitive.toolType === "trendline") {
      const line = primitive as Trendline;
      const matchedBOS = smc.bos.find((b) => b.date >= line.p1.date && b.date <= line.p2.date);
      const message = matchedBOS
        ? `Trendline Breakout (AI phat hien BOS ${matchedBOS.type}) -> xac thuc cheo boi duong xu huong nguoi ve.`
        : `Trendline (User) da ve - chua phat hien BOS trung khop trong khoang thoi gian nay.`;
      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence: matchedBOS ? 85 : null, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now() });
    }

    if (primitive.toolType === "fibonacci") {
      entries.push({
        id: `log-${++this.idCounter}-${Date.now()}`,
        message: `Fibonacci Retracement (User) da ve - 7 muc gia da tinh (0% den 100%).`,
        confidence: null, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now(),
      });
    }

    return entries;
  }

  analyzePatternConfluence(
    pattern: PatternMatch,
    smc: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] },
    vsa: VSASignal[],
    activeLayers: ActiveLayers
  ): SignalLogEntry {
    const reasons: string[] = [];
    let confidence = pattern.confidenceScore;

    if (activeLayers.smc) {
      const matchedOB = smc.obs.find((ob) => ob.date >= pattern.dateRangeStart && ob.date <= pattern.dateRangeEnd);
      if (matchedOB) { confidence = Math.min(99, confidence + 10); reasons.push(`SMC OB ${matchedOB.type} trung khop`); }
    }
    if (activeLayers.vsa) {
      const matchedVSA = vsa.find((v) => v.date >= pattern.dateRangeStart && v.date <= pattern.dateRangeEnd);
      if (matchedVSA) { confidence = Math.min(99, confidence + 8); reasons.push(`VSA ${matchedVSA.type} xac nhan`); }
    }

    const message = reasons.length > 0
      ? `User: ${pattern.patternLabel} phat hien (${pattern.ticker}) -> AI: Confluence xac nhan voi ${reasons.join(", ")} (${confidence}%).`
      : `Pattern Scanner: ${pattern.patternLabel} (${pattern.ticker}) - chua co xac nhan cheo tu layer dang bat (${confidence}%).`;

    return {
      id: `log-conf-${++this.idCounter}-${Date.now()}`, message, confidence,
      source: "ai", dataQuality: "HARD_DATA", createdAt: Date.now(),
    };
  }
}
