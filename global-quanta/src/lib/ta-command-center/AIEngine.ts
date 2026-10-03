import type { DrawnPrimitive, RectangleZone, Trendline } from "./DrawingManager";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "./detectors/smcDetector";
import { countZoneTests } from "./detectors/smcDetector";
import type { VSASignal } from "./detectors/vsaDetector";
import { WYCKOFF_PHASE_LABEL, type WyckoffResult } from "./detectors/wyckoffDetector";
import type { PatternMatch, OhlcvBar } from "./types";
import type { Provenance } from "./provenance";

export interface SignalLogEntry {
  id: string; message: string; confidence: number | null;
  source: "user" | "ai";
  /** Điểm cộng theo luật (40 + OB + VSA + Wyckoff − số lần test) là SUY LUẬN, không phải dữ liệu sàn hay xác suất. */
  dataQuality: Provenance; createdAt: number;
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
      const classification = currentPrice > top ? "Demand Zone" : currentPrice < bottom ? "Supply Zone" : "Zone (giá đang nằm trong)";

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
        reasons.push(`chồng lấn Order Block ${matchedOB.type === "bullish" ? "▲" : "▼"}${matchedOB.mitigated ? " (đã mitigated)" : ""}`);
      }
      if (matchedVSA) { confidence += 20; reasons.push(`VSA ${matchedVSA.type} trong khoảng thời gian vùng`); }
      if (matchedWyckoff) {
        confidence += 15;
        const label = wyckoff!.phase === "distribution" || wyckoff!.phase === "decline" ? "Distribution" : "Accumulation";
        reasons.push(`chồng lấn trading range Wyckoff (${label})`);
      }
      confidence = Math.max(10, Math.min(99, confidence - testPenalty));
      if (testCount >= 2) reasons.push(`đã test lại ${testCount} lần (−${testPenalty} điểm)`);

      const message = reasons.length > 0
        ? `${classification} (vẽ tay) — hợp lưu: ${reasons.join(", ")}. Điểm luật ${confidence}/99.`
        : `${classification} (vẽ tay) — chưa có hợp lưu SMC/VSA/Wyckoff. Điểm luật ${confidence}/99.`;
      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence, source: "user", dataQuality: "INFERRED", createdAt: Date.now() });
    }

    if (primitive.toolType === "trendline") {
      const line = primitive as Trendline;
      const matchedBOS = smc.bos.find((b) => b.date >= line.p1.date && b.date <= line.p2.date);
      const message = matchedBOS
        ? `Trendline (vẽ tay) — có BOS ${matchedBOS.type === "bullish" ? "▲" : "▼"} trong khoảng thời gian của đường (phá ${matchedBOS.brokenLevel.toLocaleString("vi-VN")}).`
        : `Trendline (vẽ tay) — không có BOS trong khoảng thời gian này.`;
      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence: null, source: "user", dataQuality: "DERIVED", createdAt: Date.now() });
    }

    if (primitive.toolType === "fibonacci") {
      entries.push({
        id: `log-${++this.idCounter}-${Date.now()}`,
        message: `Fibonacci Retracement (vẽ tay) — đã tính các mức 0% → 100%.`,
        confidence: null, source: "user", dataQuality: "DERIVED", createdAt: Date.now(),
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
      if (matchedOB) { confidence = Math.min(99, confidence + 10); reasons.push(`Order Block ${matchedOB.type === "bullish" ? "▲" : "▼"} trong vùng mẫu hình`); }
    }
    if (activeLayers.vsa) {
      const matchedVSA = vsa.find((v) => v.date >= pattern.dateRangeStart && v.date <= pattern.dateRangeEnd);
      if (matchedVSA) { confidence = Math.min(99, confidence + 8); reasons.push(`VSA ${matchedVSA.type}`); }
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
        reasons.push(`Wyckoff ${WYCKOFF_PHASE_LABEL[wyckoff.phase]}`);
      }
    }
    // Ghi chú: activeLayers.elliott CHỦ ĐÍCH không tham gia tính confidence
    // ở đây — Elliott là công cụ VẼ TAY (xem DrawingManager.ts), không có
    // "kết quả tự động phát hiện" để đối chiếu như SMC/VSA/Wyckoff. Giữ
    // nguyên field trong interface để UI toggle không lỗi kiểu, nhưng nêu
    // rõ lý do bằng comment thay vì âm thầm bỏ qua như code cũ.

    const message = reasons.length > 0
      ? `Pattern Scanner: ${pattern.patternLabel} (${pattern.ticker}) — hợp lưu: ${reasons.join(", ")}. Điểm luật ${confidence}/99.`
      : `Pattern Scanner: ${pattern.patternLabel} (${pattern.ticker}) — chưa có hợp lưu từ các lớp đang bật. Điểm luật ${confidence}/99.`;

    return {
      id: `log-conf-${++this.idCounter}-${Date.now()}`, message, confidence,
      source: "ai", dataQuality: "INFERRED", createdAt: Date.now(),
    };
  }
}
