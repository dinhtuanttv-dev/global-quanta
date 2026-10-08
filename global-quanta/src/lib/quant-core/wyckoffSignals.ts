// @gq/quant-core · Wyckoff W4 — tín hiệu từ dòng thời gian Phase A–E (chuyển pha) và kế hoạch 3 lần (lần 1 / 2 / 3 khớp).
// Mỗi tín hiệu có ngày BIẾT ĐƯỢC (nến xác nhận) và kết quả kiểm định đặt trước (W4, 2026-10-09) đi kèm — tín hiệu chưa đạt kiểm định
// vẫn hiển thị nhưng gắn nhãn "chưa đạt", không vào bộ lọc, không đổi pha.
import type { Bar } from "./math";
import type { WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";
import { WYCKOFF_SIGNAL_VALIDATION, type SignalKey, type SignalValidation } from "./wyckoffSignalValidation";

export type { SignalKey, SignalValidation };

export interface WyckoffSignal {
  key: SignalKey;
  side: "buy" | "sell";
  label: string;
  /** Ngày sự kiện xảy ra / ngày biết được (nến xác nhận). */
  date: string;
  knownDate: string;
  /** Số nến từ khi biết được tới nến cuối. */
  ageBars: number;
  /** Mới (≤ 5 nến) — dùng để làm nổi bật. */
  fresh: boolean;
  validation: SignalValidation;
}

export const WYCKOFF_SIGNAL_FRESH_BARS = 5;

const LABEL: Record<SignalKey, string> = {
  T1: "Lần 1 khớp (Spring #3 / Test)", T2: "Lần 2 khớp (LPS / BUEC sau SOS)", T3: "Lần 3 khớp (vượt đỉnh BU)",
  "PH-buy:C": "Vào Phase C (tích luỹ)", "PH-buy:D": "Vào Phase D (tích luỹ)", "PH-buy:E": "Vào Phase E (tăng)",
  "PH-sell:D": "Vào Phase D (phân phối)", "PH-sell:E": "Vào Phase E (giảm)",
};

/** Tín hiệu của cấu trúc ĐANG HOẠT ĐỘNG (cần `phases` / `tranches` đã tính). */
export function wyckoffSignals(bars: Bar[], w: WyckoffResult): WyckoffSignal[] {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined" || !bars.length) return [];
  const last = bars.length - 1;
  const at = (d: string) => bars.findIndex((b) => b.date === d);
  const out: WyckoffSignal[] = [];
  const push = (key: SignalKey, side: "buy" | "sell", date: string, knownIdx: number) => {
    if (knownIdx < 0) return;
    const age = last - knownIdx;
    out.push({ key, side, label: LABEL[key], date, knownDate: bars[knownIdx].date, ageBars: age, fresh: age <= WYCKOFF_SIGNAL_FRESH_BARS, validation: WYCKOFF_SIGNAL_VALIDATION[key] });
  };
  // Kế hoạch 3 lần: ngày tranche = nến biết được (nến xác nhận Spring #3 / nến Test / nến LPS / nến vượt đỉnh).
  const p = w.tranches;
  if (p && p.side === "buy") for (const t of p.tranches) if (t.status === "done" && t.date) push(`T${t.n}` as SignalKey, "buy", t.date, at(t.date));
  // Chuyển pha: pha hiện tại của dòng thời gian; biết được khi sự kiện mở pha được xác nhận.
  const cur = w.phases?.find((x) => x.current);
  if (cur) {
    const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
    const key = `PH-${long ? "buy" : "sell"}:${cur.phase}` as SignalKey;
    if (LABEL[key]) {
      const opener = w.events.filter((e) => e.index === cur.startIndex && e.confirmedIndex != null).map((e) => e.confirmedIndex!);
      push(key, long ? "buy" : "sell", cur.startDate, opener.length ? Math.max(...opener) : cur.startIndex);
    }
  }
  return out.sort((a, b) => a.ageBars - b.ageBars);
}
