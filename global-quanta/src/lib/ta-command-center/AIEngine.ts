import type { DrawnPrimitive, RectangleZone, Trendline } from "./DrawingManager";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "./detectors/smcDetector";
import { countZoneTests } from "./detectors/smcDetector";
import type { VSASignal } from "./detectors/vsaDetector";
import type { WyckoffResult } from "./detectors/wyckoffDetector";
import type { PatternMatch, OhlcvBar } from "./types";

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
    currentPrice: number,
    wyckoff?: WyckoffResult,
    // ĐÃ THÊM — optional: cần để tính số lần Demand/Supply Zone bị "test"
    // lại (countZoneTests), giảm độ tin cậy theo số lần test.
    bars?: OhlcvBar[]
  ): SignalLogEntry[] {
    const entries: SignalLogEntry[] = [];

    if (primitive.toolType === "rectangle") {
      const zone = primitive as RectangleZone;
      const top = Math.max(zone.p1.price, zone.p2.price);
      const bottom = Math.min(zone.p1.price, zone.p2.price);
      const classification = currentPrice > top ? "Ho tro" : currentPrice < bottom ? "Khang cu" : "Trung tinh";

      const matchedOB = smc.obs.find((ob) => overlaps(top, bottom, ob.top, ob.bottom));
      const matchedVSA = vsa.find((v) => v.date >= zone.p1.date && v.date <= zone.p2.date);
      // ĐÃ THÊM: đếm số lần vùng đã bị test lại — giảm độ tin cậy theo số
      // lần test (mỗi lần test thêm sau lần đầu trừ 8 điểm, tối đa trừ 24).
      const testCount = bars ? countZoneTests(bars, top, bottom, zone.p1.date) : 0;
      const testPenalty = Math.min(24, Math.max(0, testCount - 1) * 8);

      // ĐÃ THÊM: đối chiếu với vùng tích lũy/phân phối Wyckoff — trước đây
      // WyckoffResult.rangeHigh/rangeLow đã tính sẵn nhưng chưa từng được
      // dùng ở đây, dù về bản chất Demand/Supply Zone (vẽ tay) và vùng
      // tích lũy/phân phối Wyckoff là 2 cách nhìn cùng 1 hiện tượng thị
      // trường, nên đối chiếu chéo là hợp lý.
      const matchedWyckoff =
        wyckoff && wyckoff.rangeHigh !== null && wyckoff.rangeLow !== null &&
        overlaps(top, bottom, wyckoff.rangeHigh, wyckoff.rangeLow);

      let confidence = 40;
      const reasons: string[] = [];
      if (matchedOB) {
        confidence += 30;
        reasons.push(`trùng Order Block ${matchedOB.type}${matchedOB.mitigated ? " (đã mitigated — độ tin cậy thấp hơn)" : ""}`);
      }
      if (matchedVSA) { confidence += 20; reasons.push(`VSA xác nhận (${matchedVSA.type})`); }
      if (matchedWyckoff) {
        confidence += 15;
        const label = wyckoff!.phase === "distribution" || wyckoff!.phase === "decline" ? "phân phối" : "tích lũy";
        reasons.push(`trùng vùng ${label} Wyckoff`);
      }
      confidence = Math.max(10, Math.min(99, confidence - testPenalty));
      if (testCount >= 2) reasons.push(`đã bị test lại ${testCount} lần (độ tin cậy giảm ${testPenalty} điểm)`);

      const message = reasons.length > 0
        ? `Demand/Supply Zone (User) -> AI xac nhan (${confidence}%) - ${reasons.join(", ")}.`
        : `Vung ${classification} (User) - chua co xac nhan cheo tu SMC/VSA/Wyckoff (${confidence}%).`;
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
    activeLayers: ActiveLayers,
    // ĐÃ THÊM
    wyckoff?: WyckoffResult
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
    // ĐÃ SỬA — LỖI CŨ: interface ActiveLayers khai báo field "wyckoff"
    // nhưng KHÔNG NƠI NÀO trong file này từng dùng tới — bật/tắt toggle
    // "Wyckoff" trên UI trước đây hoàn toàn không ảnh hưởng tới confidence.
    if (activeLayers.wyckoff && wyckoff) {
      const phaseInRange =
        wyckoff.rangeStartDate && wyckoff.rangeEndDate &&
        pattern.dateRangeStart <= wyckoff.rangeEndDate && pattern.dateRangeEnd >= wyckoff.rangeStartDate;
      if (phaseInRange && wyckoff.phase !== "undetermined") {
        confidence = Math.min(99, confidence + 7);
        reasons.push(`Wyckoff dang o pha ${wyckoff.phase}`);
      }
    }
    // Ghi chú: activeLayers.elliott CHỦ ĐÍCH không tham gia tính confidence
    // ở đây — Elliott là công cụ VẼ TAY (xem DrawingManager.ts), không có
    // "kết quả tự động phát hiện" để đối chiếu như SMC/VSA/Wyckoff. Giữ
    // nguyên field trong interface để UI toggle không lỗi kiểu, nhưng nêu
    // rõ lý do bằng comment thay vì âm thầm bỏ qua như code cũ.

    const message = reasons.length > 0
      ? `User: ${pattern.patternLabel} phat hien (${pattern.ticker}) -> AI: Confluence xac nhan voi ${reasons.join(", ")} (${confidence}%).`
      : `Pattern Scanner: ${pattern.patternLabel} (${pattern.ticker}) - chua co xac nhan cheo tu layer dang bat (${confidence}%).`;

    return {
      id: `log-conf-${++this.idCounter}-${Date.now()}`, message, confidence,
      source: "ai", dataQuality: "HARD_DATA", createdAt: Date.now(),
    };
  }
}
