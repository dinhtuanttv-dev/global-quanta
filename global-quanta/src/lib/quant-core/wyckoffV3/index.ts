// Wyckoff v3 (quant-core) — adapter cho engine máy trạng thái Phase A → E (wyckoffGet.js, bản người dùng đính kèm 2026-10-08,
// đã sửa nhân quả / hết hiệu lực). Trả về đúng hợp đồng WyckoffResult để thẻ Wyckoff, lớp vẽ, Smart Note dùng chung.
// "Tiêu chí đạt" là đếm checklist của tài liệu, KHÔNG phải xác suất; tham số là giá trị khởi điểm, chưa hiệu chỉnh cho VN.
import { analyzeWyckoff, planForPhase, timeframeAdvice, type WyEvent, type WyStructure } from "./wyckoffGet.js";
import { classifyWyckoffPhase, type WyckoffEvent, type WyckoffEventDetail, type WyckoffPhase, type WyckoffResult } from "../../ta-command-center/detectors/wyckoffDetector";
import type { Bar } from "../math";
import { wyckoffEvidence } from "../wyckoffEvidence";

export interface WyckoffV3Options { timeframe?: string; isIndex?: boolean }

/** Tên sự kiện của engine -> tên chuẩn của giao diện (nhãn chi tiết giữ ở `label`). */
const CANON: Record<string, WyckoffEvent> = {
  PS: "PS", SC: "SC", AR: "AR", ST: "ST", SPRING_3: "Spring", SPRING_2: "Spring", SHAKEOUT: "Spring", TEST: "Test", SOS: "SOS", LPS: "LPS",
  PSY: "PSY", BC: "BC", UT_3: "UT", UT_2: "UT", UTAD: "UTAD", SOW: "SOW", LPSY: "LPSY",
  BUA: "BUA", BUA_FORMING: "BUA", E_BREAKOUT: "E", E_BREAKDOWN: "E", SOW_B: "SOW_B", UTA: "UTA", UT: "UT",
  SPRING_FAIL: "FAIL", UT_FAIL: "FAIL", SOS_FAIL: "FAIL", SOW_FAIL: "FAIL", STRUCTURE_FAIL: "FAIL", BREAKDOWN: "FAIL", BREAKOUT_UP: "FAIL",
  SPRING_PENDING: "PENDING", UT_PENDING: "PENDING",
};

/** Pha giao diện (dùng chung với v1/v2, bộ lọc Hội tụ) từ cấu trúc v3. */
export function uiPhaseOf(s: Pick<WyStructure, "kind" | "direction" | "phase" | "events">): WyckoffPhase {
  if (s.kind === "range-undetermined") return "undetermined";
  const long = s.direction === "long";
  const hasTest = s.events.some((e) => e.type === "TEST");
  switch (s.phase) {
    case "A": case "B": return long ? "accumulation" : "distribution";
    case "C": return long ? (hasTest ? "test" : "spring") : "distribution";
    case "D": case "E": return long ? "markup" : "decline";
    default: return "undetermined";
  }
}

const CHECK_LABEL: Record<string, string> = {
  climaxVolumeSpike: "Climax (SC/BC) có KL đột biến ≥ 2× TB50",
  secondaryTestLowerVolume: "ST có KL thấp hơn climax",
  phaseATrendlineBreak: "AR phá trendline của xu hướng trước",
  springLowVolume: "Spring/UT với KL thấp (cung/cầu cạn)",
  sosWithVolume: "SOS/SOW có KL ≥ 1,2× TB50",
};

const KIND_VI: Record<string, string> = {
  accumulation: "tích luỹ", "re-accumulation": "tái tích luỹ", distribution: "phân phối", "re-distribution": "tái phân phối",
  "range-undetermined": "vùng đi ngang chưa rõ hướng",
};

export function classifyWyckoffV3(bars: Bar[], opts: WyckoffV3Options = {}): WyckoffResult {
  const asOf = bars.length ? bars[bars.length - 1].date : null;
  const base: WyckoffResult = { ...classifyWyckoffPhase([]), engine: "v3", asOf, events: [] };
  const tf = opts.timeframe ?? "D";
  const advice = timeframeAdvice(tf);
  const caveats: string[] = [
    "Tham số là giá trị khởi điểm theo tài liệu Wyckoff, chưa hiệu chỉnh cho thị trường VN.",
    "Vùng đi ngang không có SC/BC rõ (tái tích luỹ / tái phân phối): hướng được chọn theo số bằng chứng tới hiện tại và CÓ THỂ ĐỔI khi có nến mới.",
  ];
  if (!advice.tradeable) caveats.unshift(`Khung ${tf}: ${advice.note}`);
  if (opts.isIndex) caveats.push("VN-Index là chỉ số, không giao dịch trực tiếp; khối lượng là KL toàn thị trường (không phải dòng tiền vào một tài sản).");
  if (!bars.length || !bars.every((b) => Number.isFinite(b.volume) && b.volume >= 0)) {
    return { ...base, status: "insufficient", statusReason: "Thiếu khối lượng — Wyckoff cần khối lượng.", caveats };
  }
  if (bars.every((b) => b.volume === 0)) return { ...base, status: "insufficient", statusReason: "Khối lượng toàn bằng 0 — không phân tích được.", caveats };
  const candles = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const res = analyzeWyckoff(candles);
  if (res.error) return { ...base, status: "insufficient", statusReason: res.error, caveats };

  const date = (i: number) => bars[Math.min(Math.max(0, i), bars.length - 1)].date;
  const mapEvents = (s: WyStructure): WyckoffEventDetail[] => s.events.map((e: WyEvent) => ({
    event: CANON[e.type] ?? "PENDING", label: e.type, date: date(e.i), index: e.i, price: e.price,
    volume: bars[e.i]?.volume ?? 0, strength: e.ci == null ? 0.5 : 0.8,
    confirmedIndex: e.ci, confirmedDate: e.ci == null ? null : date(e.ci),
  }));
  const evidenceOf = (s: WyStructure, ev: WyckoffEventDetail[]) => wyckoffEvidence(bars, { start: s.startI, end: s.endI, high: s.resistance, low: s.support }, ev);
  const current = res.current;
  const structures = res.structures.map((s) => ({
    kind: s.kind, direction: s.direction, wyckoffPhase: s.phase, status: s.status, current: s === current,
    rangeHigh: s.resistance, rangeLow: s.support, startDate: date(s.startI), endDate: date(s.endI),
  }));

  if (!current) {
    const lastEnded = [...res.structures].filter((s) => s.status !== "active").sort((a, b) => b.endI - a.endI)[0] ?? null;
    // Phase E (xu hướng sau cấu trúc đã hoàn tất) VẪN là pha hiện tại khi còn mới và giá chưa quay về phía bên kia TR.
    if (lastEnded && lastEnded.status === "completed" && !lastEnded.freshness.stale) {
      const last = bars[bars.length - 1].close;
      // Phase E còn hiệu lực khi giá chưa quay SÂU vào TR (giữa TR — cùng ngưỡng thất bại của SOS); quay về sâu = phá vỡ thất bại.
      const mid = (lastEnded.support + lastEnded.resistance) / 2;
      const holding = lastEnded.direction === "long" ? last >= mid : last <= mid;
      if (holding) {
        const plan = planForPhase("E", lastEnded.direction);
        return {
          ...base, structures, caveats, status: "active", phase: lastEnded.direction === "long" ? "markup" : "decline",
          statusReason: `Phase E: xu hướng ${lastEnded.direction === "long" ? "tăng" : "giảm"} sau cấu trúc ${KIND_VI[lastEnded.kind] ?? lastEnded.kind} đã hoàn tất (phá khỏi BUA ${date(lastEnded.endI)}).`,
          wyckoffPhase: "E", kind: lastEnded.kind,
          rangeHigh: lastEnded.resistance, rangeLow: lastEnded.support, rangeStartDate: date(lastEnded.startI), rangeEndDate: date(lastEnded.endI),
          events: mapEvents(lastEnded),
          evidence: evidenceOf(lastEnded, mapEvents(lastEnded)),
          checks: [{ label: `Còn hiệu lực: ${lastEnded.freshness.barsSinceLastEvent} nến từ sự kiện xác nhận cuối (ngưỡng ${lastEnded.freshness.limit})`, ok: true },
            { label: lastEnded.direction === "long" ? "Giá giữ trên hỗ trợ TR" : "Giá giữ dưới kháng cự TR", ok: true }],
          plan: { action: plan.action, detail: plan.detail },
        };
      }
    }
    const out: WyckoffResult = { ...base, structures, caveats, status: lastEnded ? "historical" : "insufficient", phase: "undetermined" };
    if (lastEnded) {
      const failNote = lastEnded.events.filter((e) => /FAIL|BREAKDOWN|BREAKOUT_UP/.test(e.type)).map((e) => e.note).find(Boolean);
      const reason = lastEnded.status === "stale" ? lastEnded.freshness.reasons.join("; ")
        : lastEnded.status === "failed" ? `cấu trúc thất bại (${failNote ?? "sự kiện thất bại"})`
        : lastEnded.status === "completed"
          ? (lastEnded.freshness.stale
            ? `cấu trúc đã hoàn tất (Phase E) từ lâu — ${lastEnded.freshness.reasons.join("; ")}`
            : "cấu trúc đã hoàn tất (Phase E) nhưng giá đã quay sâu vào TR (qua giữa TR) — phá vỡ thất bại")
        : `cấu trúc bị phá vỡ (${failNote ?? "không quay lại trading range"})`;
      out.historical = {
        phase: uiPhaseOf(lastEnded), wyckoffPhase: lastEnded.phase, kind: lastEnded.kind, status: lastEnded.status,
        rangeHigh: lastEnded.resistance, rangeLow: lastEnded.support, startDate: date(lastEnded.startI), endDate: date(lastEnded.endI), reason,
      };
      out.statusReason = `Không có cấu trúc Wyckoff đang hoạt động. Cấu trúc gần nhất (${KIND_VI[lastEnded.kind] ?? lastEnded.kind}, Phase ${lastEnded.phase}): ${reason}.`;
      out.rangeHigh = lastEnded.resistance; out.rangeLow = lastEnded.support;
      out.rangeStartDate = date(lastEnded.startI); out.rangeEndDate = date(lastEnded.endI);
      out.events = mapEvents(lastEnded);
      out.evidence = evidenceOf(lastEnded, out.events);
    } else out.statusReason = "Chưa tìm thấy cấu trúc Wyckoff (climax SC/BC hoặc trading range nối tiếp một xu hướng).";
    return out;
  }

  const phase = uiPhaseOf(current);
  const events = mapEvents(current);
  const lastConfirmed = (t: WyckoffEvent) => {
    const list = events.filter((e) => e.event === t && e.confirmedIndex != null);
    return list.length ? list[list.length - 1].date : null;
  };
  const checks = Object.entries(current.checklist ?? {})
    .filter(([k]) => CHECK_LABEL[k])
    .map(([k, v]) => ({ label: CHECK_LABEL[k], ok: v }));
  checks.push({ label: `Còn hiệu lực: sự kiện xác nhận cuối cách ${current.freshness.barsSinceLastEvent} nến (ngưỡng ${current.freshness.limit} = độ dài cấu trúc)`, ok: !current.freshness.stale });
  const okN = checks.filter((c) => c.ok === true).length, avail = checks.filter((c) => c.ok !== null).length;
  const provisional = events.filter((e) => e.confirmedIndex == null);
  if (provisional.length) caveats.unshift(`Có ${provisional.length} sự kiện CHƯA xác nhận (${provisional.map((e) => e.label).join(", ")}) — có thể thay đổi ở nến sau.`);
  if (current.kind === "range-undetermined") caveats.unshift("Đang trong trading range nhưng chưa đủ bằng chứng để biết là tích luỹ hay phân phối.");
  const plan = planForPhase(current.phase, current.direction);
  return {
    ...base, phase, structures, caveats, checks,
    status: phase === "undetermined" ? "insufficient" : "active",
    statusReason: phase === "undetermined"
      ? "Đang trong trading range, chưa đủ bằng chứng hướng."
      : `Cấu trúc ${KIND_VI[current.kind] ?? current.kind} đang hoạt động, Phase ${current.phase}.`,
    wyckoffPhase: (["A", "B", "C", "D", "E"].includes(current.phase) ? current.phase : null) as WyckoffResult["wyckoffPhase"],
    kind: current.kind,
    confidenceScore: avail ? Math.round((okN / avail) * 100) : 0,
    rangeHigh: current.resistance, rangeLow: current.support,
    rangeStartDate: date(current.startI), rangeEndDate: date(current.endI),
    events,
    evidence: evidenceOf(current, events),
    springDate: lastConfirmed("Spring") ?? lastConfirmed("UT") ?? lastConfirmed("UTAD"),
    testDate: lastConfirmed("Test") ?? lastConfirmed("ST"),
    markupDate: lastConfirmed("SOS"), declineDate: lastConfirmed("SOW"),
    phaseC: current.spring ? `${current.spring.type} · ${current.variantNote || current.variant}` : current.variantNote || undefined,
    plan: { action: plan.action, detail: plan.detail },
  };
}
