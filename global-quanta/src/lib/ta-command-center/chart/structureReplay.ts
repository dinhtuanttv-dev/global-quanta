// Chế độ PHÁT LẠI của lớp Cấu trúc MTF (T6): tính lại cấu trúc trên trình duyệt bằng chính quant-core với nến ngày
// bars[0..i] (không nhìn trước) -> người dùng xem "lúc đó hệ thống nói gì" rồi đối chiếu với các nến thực tế phía sau.
// Không có nón dự báo / xác suất (cần tham số kiểm định ở Gateway) — chỉ cấu trúc, mẫu hình, vùng giá, kịch bản, kết luận.
import { analyzeStructureMtf, compactStructure } from "../../quant-core/mtf";
import type { OhlcvBar } from "../types";
import type { StructureDoc } from "../../../hooks/useStructure";

export const REPLAY_MIN_BARS = 130;

export function replayDoc(daily: OhlcvBar[], index: number, server: StructureDoc | null | undefined, symbol = ""): StructureDoc | null {
  if (index < REPLAY_MIN_BARS - 1 || index >= daily.length) return null;
  const d = daily.slice(0, index + 1).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
  const base = compactStructure(analyzeStructureMtf({ d }));
  return {
    ...(base as unknown as Omit<StructureDoc, "symbol" | "generatedAt" | "dataSource" | "cone" | "probability" | "stageOdds" | "evidence">),
    symbol: server?.symbol ?? symbol, generatedAt: "",
    dataSource: server?.dataSource ?? { daily: { source: "SSI · /ta-series", priceBasis: "", bars: d.length, warnings: [] }, h1: { unavailable: "Phát lại chỉ dùng khung Tuần / Ngày." } },
    cone: null, probability: null, stageOdds: null,
    evidence: server?.evidence ?? { prereg: "", status: "PENDING", verdicts: {}, summary: null, labels: { stageUp: "ĐANG KIỂM ĐỊNH", alignment: "ĐANG KIỂM ĐỊNH", checklist: "ĐANG KIỂM ĐỊNH", patterns: "ĐANG KIỂM ĐỊNH", stageDown: "ĐANG KIỂM ĐỊNH" } },
  } as StructureDoc;
}
