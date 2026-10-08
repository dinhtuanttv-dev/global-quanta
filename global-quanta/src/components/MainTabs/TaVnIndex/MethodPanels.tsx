"use client";
import { Clock } from "lucide-react";
import { SMC_DISPLAY_LIMIT, type OrderBlock, type FairValueGap, type BreakOfStructure, type SmcTotals } from "../../../lib/ta-command-center/AnalysisController";
import { VSA_DIRECTION, type VsaSignal as VSASignal } from "../../../lib/quant-core";
import { WYCKOFF_PHASE_LABEL, describeRangeCriteria, type WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import type { WyckoffEvidence } from "../../../lib/quant-core/wyckoffEvidence";
import type { WyckoffTests } from "../../../lib/quant-core/wyckoffTests";
import ProvenanceBadge from "./ProvenanceBadge";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;
const fmt = (v: number) => v.toLocaleString("vi-VN");

export function SMCPanel({ obs, fvgs, bos, choch, totals, barCount }: {
  obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[]; choch: BreakOfStructure[]; totals: SmcTotals; barCount: number;
}) {
  const lastOB = obs[obs.length - 1];
  const shifts = [...bos, ...choch].sort((a, b) => a.date.localeCompare(b.date));
  const lastShift = shifts[shifts.length - 1];
  const isChoch = !!lastShift && choch.includes(lastShift);
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="smc-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        Smart Money Concepts <ProvenanceBadge kind="DERIVED" />
      </p>
      <p className="text-sm font-bold font-mono text-slate-100">
        {totals.obs} OB · {totals.fvgs} FVG · {totals.bos} BOS · {totals.choch} CHoCH
      </p>
      <p className="text-[9px] text-slate-500 mt-0.5">
        Toàn bộ {barCount} nến · {totals.sweeps} Liquidity Sweep · vẽ {Math.min(totals.obs, SMC_DISPLAY_LIMIT.obs)} OB / {Math.min(totals.fvgs, SMC_DISPLAY_LIMIT.fvgs)} FVG gần nhất
      </p>
      {lastShift && (
        <p className="text-[9px] mt-1" style={{ color: lastShift.type === "bullish" ? "#34d399" : "#f43f5e" }}>
          {isChoch ? "CHoCH (Structural Shift)" : "BOS"} {lastShift.type === "bullish" ? "▲" : "▼"} {lastShift.date} · phá {fmt(lastShift.brokenLevel)}{lastShift.displaced ? " · displacement" : ""}
        </p>
      )}
      {lastOB && (
        <p className="text-[9px] text-slate-500 mt-0.5 font-mono">
          OB gần nhất {lastOB.type === "bullish" ? "▲" : "▼"} {fmt(lastOB.bottom)}–{fmt(lastOB.top)} · {lastOB.status === "ACTIVE" ? "chưa test" : lastOB.status === "MITIGATED" ? "mitigated (50%)" : lastOB.status === "BREAKER" ? "Breaker Block" : "hết hạn"}
        </p>
      )}
    </div>
  );
}


export function VSAPanel({ signals }: { signals: VSASignal[] }) {
  const last = signals[signals.length - 1];
  const d = last ? VSA_DIRECTION[last.type] : null;
  const dir = d === "bullish" ? "▲" : d === "bearish" ? "▼" : undefined;
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="vsa-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        VSA · Effort vs Result <ProvenanceBadge kind="DERIVED" />
      </p>
      {last ? (
        <>
          <p className="text-sm font-bold text-slate-100" style={dir ? { color: dir === "▲" ? "#34d399" : "#f43f5e" } : undefined}>
            {dir ? `${dir} ` : ""}{last.type}
          </p>
          <p className="text-[9px] text-slate-500 mt-1 font-mono">
            zV {last.zV} · zS {last.zS} · CLV {last.clv} · {last.date}
          </p>
          {!dir && <p className="text-[9px] text-slate-600 mt-0.5">Absorption: effort lớn, result nhỏ — trung tính về hướng.</p>}
        </>
      ) : <p className="text-[10px] text-slate-600 italic">Chưa có tín hiệu VSA trong 8 tín hiệu gần nhất.</p>}
    </div>
  );
}

const STATUS_UI = {
  active: { text: "Đang hoạt động", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  historical: { text: "Lịch sử · hết hiệu lực", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  insufficient: { text: "Chưa đủ bằng chứng", cls: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
} as const;

const EVENT_VI: Record<string, string> = {
  PS: "PS – hỗ trợ sơ bộ", SC: "SC – bán tháo cao trào", AR: "AR – nhịp hồi tự động", ST: "ST – kiểm định lại",
  Spring: "Spring – rũ bỏ dưới hỗ trợ", Test: "Test – kiểm định Spring", SOS: "SOS – dấu hiệu sức mạnh", LPS: "LPS – điểm hỗ trợ cuối",
  PSY: "PSY – cung sơ bộ", BC: "BC – mua cao trào", UT: "UT – bẫy tăng", UTAD: "UTAD – bẫy tăng sau phân phối",
  SOW: "SOW – dấu hiệu suy yếu", LPSY: "LPSY – điểm cung cuối", BUA: "BUA – nền trên kháng cự", E: "Phase E – phá vỡ xu hướng",
  SOW_B: "SOW trong Phase B", UTA: "UTA – vượt đỉnh giả trong B", FAIL: "Cấu trúc thất bại", PENDING: "Đang chờ xác nhận",
};


const VERDICT_UI = {
  confirmed: { mark: "✓", text: "xác nhận", cls: "text-emerald-300" },
  rejected: { mark: "✗", text: "không xác nhận", cls: "text-rose-300" },
  unclear: { mark: "–", text: "chưa rõ", cls: "text-slate-400" },
  pending: { mark: "◌", text: "chờ nến sau", cls: "text-slate-400" },
} as const;

/** Bằng chứng VSA theo tài liệu (Spring #1/#2/#3, nến xác nhận, Creek/ICE · JAC/BUEC, tích luỹ vs phân phối). Chỉ hiển thị. */
export function WyckoffEvidenceBlock({ ev, current }: { ev: WyckoffEvidence; current: boolean }) {
  const has = ev.springs.length || ev.confirmations.length || ev.breaks.length || ev.lean;
  if (!has) return null;
  const dim = current ? "text-slate-300" : "text-slate-500";
  return (
    <details className="text-[9px] text-slate-400" data-testid="wyckoff-evidence" open={current}>
      <summary className="cursor-pointer">Bằng chứng VSA (theo tài liệu Wyckoff/VSA){current ? "" : " · cấu trúc lịch sử"}</summary>
      <ul className="pt-1 space-y-1">
        {ev.springs.map((sp) => (
          <li key={`sp-${sp.index}`} className={`${dim} leading-snug`} data-testid="wyckoff-ev-spring">
            <span className={`inline-block mr-1.5 px-1 rounded border text-[8px] ${sp.actionable ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}>
              {sp.side === "spring" ? "Spring" : "UT"} #{sp.kind} · {sp.actionable ? "đủ điều kiện" : "chờ Test"}
            </span>
            {sp.note.replace(/^(Spring|UT) #\d: /, "")}
          </li>
        ))}
        {ev.confirmations.map((c) => {
          const v = VERDICT_UI[c.verdict];
          return (
            <li key={`cf-${c.event}-${c.index}`} className={`${dim} leading-snug`} data-testid="wyckoff-ev-confirm">
              <span className={v.cls}>{v.mark}</span> {c.event} {c.date} → nến sau{c.at ? ` ${c.at.date}` : ""}: <span className={v.cls}>{v.text}</span> — {c.reason}
            </li>
          );
        })}
        {ev.breaks.map((b) => (
          <li key={`br-${b.kind}-${b.index}`} className={`${dim} leading-snug`} data-testid="wyckoff-ev-break">
            <span className={b.kind === "JAC" ? "text-emerald-300" : b.kind === "ICE-break" ? "text-rose-300" : "text-slate-400"}>{b.kind === "JAC" ? "JAC" : b.kind === "ICE-break" ? "Phá ICE" : b.kind === "creek-weak" ? "Vượt Creek yếu" : "Thủng ICE yếu"}</span> {b.date}: {b.note}
          </li>
        ))}
        {ev.lean && (
          <li className={dim} data-testid="wyckoff-ev-lean">
            Đặc điểm range: <span className="text-violet-300">{ev.lean.label === "chưa rõ" ? "chưa rõ tích luỹ hay phân phối" : `nghiêng ${ev.lean.label}`}</span> ({ev.lean.score > 0 ? "+" : ""}{ev.lean.score}/4)
            <ul className="pl-3 text-slate-500">
              {ev.lean.features.map((f) => <li key={f.key}>{f.vote > 0 ? "▲" : f.vote < 0 ? "▼" : "·"} {f.label}: {f.value}</li>)}
            </ul>
          </li>
        )}
      </ul>
      <p className="text-slate-600 pt-1">{ev.note}</p>
    </details>
  );
}

/** 9 phép thử mua / bán (W2): đạt / chưa đạt + cách đo; kênh xu hướng, sức mạnh so với VN-Index, mục tiêu ước lượng. */
export function WyckoffTestsBlock({ t }: { t: WyckoffTests }) {
  const f = (v: number) => Math.round(v).toLocaleString("vi-VN");
  return (
    <details className="text-[9px] text-slate-400" data-testid="wyckoff-tests">
      <summary className="cursor-pointer">
        9 phép thử {t.side === "buy" ? "mua" : "bán"}: <span className="text-slate-200 font-semibold">{t.passed}/{t.avail}</span> đạt
        {t.avail < 9 ? ` (${9 - t.avail} chưa đo được)` : ""} · không phải xác suất
      </summary>
      <ol className="pt-1 space-y-0.5">
        {t.items.map((x) => (
          <li key={x.key} className="leading-snug" data-testid={`wyckoff-test-${x.key}`}>
            <span className={x.ok === true ? "text-emerald-300" : x.ok === false ? "text-rose-300" : "text-slate-500"}>{x.ok === true ? "✓" : x.ok === false ? "✗" : "–"}</span>{" "}
            {x.n}. <span className="text-slate-300">{x.label}</span> <span className="text-slate-500">— {x.value}</span>
          </li>
        ))}
      </ol>
      {t.channel?.climaxOutside && (
        <p className="pt-1 text-slate-300">
          Cao trào {t.channel.kind === "down" ? "thủng dưới kênh giảm (quá bán)" : "vượt trên kênh tăng (quá mua)"} ngày {t.channel.climaxOutside.date} — dấu hiệu {t.channel.kind === "down" ? "SC" : "BC"} theo tài liệu.
        </p>
      )}
      <p className="pt-1 text-slate-400 font-mono" data-testid="wyckoff-targets">
        Mục tiêu ước lượng (nguyên nhân–kết quả): {t.targets.map((x) => `${x.k}× ${f(x.price)}`).join(" · ")}
        {t.retrace50 != null ? ` · vùng hồi 50% ${f(t.retrace50)}` : ""}
      </p>
      <p className="text-slate-600 pt-0.5">{t.note}</p>
    </details>
  );
}

/**
 * Thẻ Wyckoff Cycle: phân biệt pha HIỆN TẠI (cấu trúc còn hiệu lực) với cấu trúc LỊCH SỬ đã hết hiệu lực; mỗi sự kiện
 * có ngày xảy ra và ngày xác nhận; tiêu chí đạt / chưa đạt; lý do kết luận có thể sai. Không hiển thị "độ tin cậy %".
 */
export function WyckoffPanel({ result, barCount, compare, timeframe }: { result: WyckoffResult; barCount: number; compare?: WyckoffResult | null; timeframe?: string }) {
  // Kết quả kiểu cũ (không có status): coi là đang hoạt động nếu đã có pha.
  const status = result.status ?? (result.phase === "undetermined" ? "insufficient" : "active");
  const ui = STATUS_UI[status];
  const isCurrent = status === "active" && result.phase !== "undetermined";
  const events = [...result.events].sort((a, b) => a.index - b.index).slice(-6);
  const checks = result.checks ?? [];
  const okN = checks.filter((c) => c.ok === true).length, avail = checks.filter((c) => c.ok !== null).length;
  const fmtP = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));
  return (
    <div style={CARD} className="rounded-xl p-3 space-y-1.5" data-testid="wyckoff-panel" data-status={status}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 flex-wrap">
        Wyckoff Cycle <ProvenanceBadge kind="INFERRED" />
        <span className={`ml-auto normal-case text-[8.5px] px-1.5 py-0.5 rounded border ${ui.cls}`} data-testid="wyckoff-status">{ui.text}</span>
      </p>
      <p className="text-sm font-bold text-violet-300" data-testid="wyckoff-phase">
        {isCurrent ? WYCKOFF_PHASE_LABEL[result.phase] : status === "historical" ? "Chưa xác định pha hiện tại" : WYCKOFF_PHASE_LABEL[result.phase]}
        {isCurrent && result.wyckoffPhase && <span className="text-[10px] text-violet-300/70 font-semibold"> · Phase {result.wyckoffPhase}</span>}
      </p>
      {result.statusReason && <p className="text-[9px] text-slate-400 leading-snug" data-testid="wyckoff-reason">{result.statusReason}</p>}
      {result.status == null && result.phase === "undetermined" && result.rangeLow == null && (
        <p className="text-[9px] text-slate-500">Chưa tìm thấy trading range: {describeRangeCriteria(barCount)}.</p>
      )}

      {result.rangeLow != null && result.rangeHigh != null && (
        <p className={`text-[9px] font-mono ${isCurrent ? "text-slate-400" : "text-slate-500"}`} data-testid="wyckoff-range">
          {isCurrent ? "Range" : "Range lịch sử"} {fmtP(result.rangeLow)}–{fmtP(result.rangeHigh)} · {result.rangeStartDate} → {result.rangeEndDate ?? "nay"}
        </p>
      )}
      {result.historical && (
        <p className="text-[9px] text-amber-300/80 leading-snug" data-testid="wyckoff-historical">
          Cấu trúc gần nhất: {WYCKOFF_PHASE_LABEL[result.historical.phase]}{result.historical.wyckoffPhase ? `, Phase ${result.historical.wyckoffPhase}` : ""}
          {result.statusReason?.includes(result.historical.reason) ? "" : ` — ${result.historical.reason}`}
        </p>
      )}
      {result.phaseC && isCurrent && <p className="text-[9px] text-violet-300/80">{result.phaseC}</p>}
      {result.phaseE && <p className="text-[9px] text-amber-300/80" data-testid="wyckoff-location">{result.phaseE}</p>}

      {events.length > 0 && (
        <ul className="text-[9px] font-mono space-y-0.5" data-testid="wyckoff-events">
          {events.map((e, i) => {
            const pending = e.confirmedIndex === null;
            const later = e.confirmedDate && e.confirmedDate !== e.date;
            return (
              <li key={`${e.event}-${e.index}-${i}`} className={`flex justify-between gap-2 ${isCurrent ? "text-slate-300" : "text-slate-500"}`}>
                <span className="truncate font-sans" title={EVENT_VI[e.event] ?? e.event}>{pending ? "◌ " : "● "}{e.label && e.label !== e.event ? `${e.event} (${e.label})` : e.event}</span>
                <span className="whitespace-nowrap">{e.date}{pending ? " · chờ xác nhận" : later ? ` · xác nhận ${e.confirmedDate}` : ""}</span>
              </li>
            );
          })}
        </ul>
      )}

      {result.evidence && <WyckoffEvidenceBlock ev={result.evidence} current={isCurrent} />}
      {isCurrent && result.tests && <WyckoffTestsBlock t={result.tests} />}

      {checks.length > 0 && (
        <details className="text-[9px] text-slate-400" data-testid="wyckoff-checks">
          <summary className="cursor-pointer">Tiêu chí: {okN}/{avail} đạt (đếm tiêu chí, không phải xác suất)</summary>
          <ul className="pt-1 space-y-0.5">
            {checks.map((c) => <li key={c.label}>{c.ok === true ? "✓" : c.ok === false ? "✗" : "–"} {c.label}</li>)}
          </ul>
        </details>
      )}
      {result.status == null && (
        <p className="text-[9px] text-slate-600" title="Tỷ lệ sự kiện mẫu chuẩn đã xuất hiện — không phải xác suất">
          Sự kiện khớp mẫu: {result.confidenceScore}% (không phải xác suất)
        </p>
      )}
      {(result.caveats?.length ?? 0) > 0 && (
        <details className="text-[9px] text-slate-500" data-testid="wyckoff-caveats">
          <summary className="cursor-pointer">Vì sao kết luận có thể sai</summary>
          <ul className="pt-1 space-y-0.5 list-disc pl-3">{result.caveats!.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}
      {compare && (
        <p className="text-[9px] text-slate-500 border-t border-white/5 pt-1" data-testid="wyckoff-compare">
          Engine {compare.engine} (thử nghiệm, chưa đạt tiêu chí làm mặc định):{" "}
          <span className="text-slate-300">
            {compare.status === "active" && compare.phase !== "undetermined" ? `${WYCKOFF_PHASE_LABEL[compare.phase]}${compare.wyckoffPhase ? ` · Phase ${compare.wyckoffPhase}` : ""}` : compare.status === "historical" ? "chưa xác định (cấu trúc cũ hết hiệu lực)" : "chưa đủ bằng chứng"}
          </span>
        </p>
      )}
      <p className="text-[8.5px] text-slate-600">
        Engine {result.engine ?? "v1"} · dữ liệu tới {result.asOf ?? "—"} · {barCount} nến{timeframe ? ` · khung ${timeframe}` : ""} · kiểm định 10/2024–10/2026: nhãn pha chưa có lợi thế dự báo nhất quán
      </p>
    </div>
  );
}

export function ElliottWavePanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        Elliott Wave <span className="ml-auto flex items-center gap-0.5 text-[8.5px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai đoạn 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Đếm sóng mang tính chủ quan cao — dùng công cụ vẽ Elliott (có kiểm tra quy tắc) hoặc gợi ý Zigzag.</p>
    </div>
  );
}
