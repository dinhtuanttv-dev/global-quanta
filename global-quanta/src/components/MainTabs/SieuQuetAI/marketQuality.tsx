// Chất lượng số liệu cho các bảng thị trường (PR-A, MARKET_CENTER_UPGRADE_PLAN.md §3).
// Chỉ định dạng và đánh giá độ tin cậy từ dữ liệu API đã có; không tính lại số nghiệp vụ.
import { useEffect, useId, useRef, useState } from "react";
import type { PreopenDoc, ScenarioId } from "../../../hooks/usePreopen";

/** Sự kiện để khối khác (Trading Matrix) mở thẳng tab "Các nhãn đo gì" của Trung tâm thị trường. */
export const OPEN_LABELS_EVENT = "gq:market-center-labels";

export type Grade = "A" | "B" | "C";
const GRADE_TXT: Record<Grade, string> = { A: "A · đã qua kiểm định đặt trước", B: "B · đo lường trực tiếp", C: "C · mô tả, chưa kiểm định hoặc không đạt" };
const GRADE_CLS: Record<Grade, string> = { A: "text-emerald-300 border-emerald-500/40", B: "text-slate-300 border-slate-500/40", C: "text-amber-300 border-amber-500/40" };

/** Huy hiệu cấp bằng chứng: chữ + viền, không chỉ dựa vào màu. */
export function GradeBadge({ g }: { g: Grade }) {
  return <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 text-[10px] font-bold ${GRADE_CLS[g]}`} title={GRADE_TXT[g]} data-grade={g}>{g}</span>;
}

/**
 * Nguồn gốc của một ô số (PR-C, F-C7): bấm ⓘ để xem nguồn, thời điểm, mô hình/quy tắc, cấp bằng chứng.
 * Dùng được bằng bàn phím (Enter/Space mở, Esc đóng) và cảm ứng; không chỉ là tooltip rê chuột.
 */
export function Prov({ label, rows, grade, testId }: { label: string; rows: [string, string | null | undefined][]; grade?: Grade; testId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId(), ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const shown = rows.filter(([, v]) => v != null && v !== "");
  return (
    <span ref={ref} className="relative inline-flex align-middle" data-testid={testId}>
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={`Nguồn gốc: ${label}`} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] leading-none text-slate-400 hover:border-q-accent/60 hover:text-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-q-accent">i</button>
      {open && (
        <span id={id} role="dialog" aria-label={`Nguồn gốc: ${label}`} onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-5 z-30 block w-[min(18rem,80vw)] rounded-lg border border-white/15 bg-[#0d1424] p-2 text-left text-[11px] font-normal normal-case shadow-xl shadow-black/50 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:left-3 max-sm:w-auto max-sm:p-3 max-sm:text-[12px]">
          <b className="block text-slate-100">{label}</b>
          <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            {shown.map(([k, v]) => <span key={k} className="contents"><span className="text-slate-500">{k}</span><span className="break-words text-slate-200">{v}</span></span>)}
            {grade && <><span className="text-slate-500">Cấp</span><span className="flex items-center gap-1 text-slate-200"><GradeBadge g={grade} />{GRADE_TXT[grade].slice(4)}</span></>}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Khoảng tin cậy Wilson cho một tỷ lệ (mặc định 95%). Ổn định hơn khoảng Wald khi n nhỏ hoặc p gần 0/1,
 * nên dùng được cho sổ tiến mới vài chục phiên. Trả về phần trăm.
 */
export function wilson(pct: number | null | undefined, n: number | null | undefined, z = 1.96): { lo: number; hi: number } | null {
  if (pct == null || !Number.isFinite(pct) || !n || n <= 0) return null;
  const k = Math.round((pct / 100) * n), p = k / n, z2 = z * z;
  const den = 1 + z2 / n, center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, (center - half) * 100), hi: Math.min(100, (center + half) * 100) };
}

/**
 * Tư thế và câu hành động chỉ được hiện khi cổng kiểm định tương ứng đạt (PO-r2: G3 xác suất, G4 không bán đuổi, G5 không mua đuổi).
 * Kịch bản Trung tính không có cổng riêng nên dựa vào G3.
 */
export function postureAllowed(id: ScenarioId, ev: PreopenDoc["evidence"]): boolean {
  if (ev.probabilities) return true;
  return (id === "neg" && ev.noPanicSell) || (id === "pos" && ev.noChase);
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** "T6 04:59 21/11" theo giờ Việt Nam. */
export function vnWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t + 7 * 3_600_000), p = (n: number) => String(n).padStart(2, "0");
  return `${WD[d.getUTCDay()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
}

const pct = (v: number, d = 0) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Lần làm mới gần nhất thất bại nhưng vẫn còn bản trước: báo rõ đang hiện bản nào. SWR tự thử lại theo chu kỳ của hook.
 */
export function StaleNotice({ error, asOf, testId }: { error: Error | undefined | null; asOf: string | null | undefined; testId: string }) {
  if (!error) return null;
  return (
    <p role="status" data-testid={testId} className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-2 py-1 text-[11px] text-amber-200">
      <span aria-hidden>⚠</span>
      <span>Không làm mới được ({error.message}). Đang hiện bản cập nhật {vnWhen(asOf)}; hệ thống tự thử lại.</span>
    </p>
  );
}

/**
 * Thanh khoảng tin cậy 0–100%: dải KTC, điểm ước lượng, vạch đích (nếu có) và vạch so sánh (nếu có).
 * Có văn bản cho trình đọc màn hình; màu không phải tín hiệu duy nhất.
 */
export function CiBar({ value, n, target, compare, label, testId }: { value: number | null | undefined; n: number; target?: number; compare?: { v: number; label: string }; label: string; testId?: string }) {
  const ci = wilson(value, n);
  if (value == null || !ci) return <span className="block text-[11px] text-slate-500" data-testid={testId}>{label}: chưa đủ dữ liệu</span>;
  const hit = target == null ? null : ci.lo <= target && ci.hi >= target;
  const sr = `${label} ${pct(value, 1)}%,khoảng tin cậy 95% từ ${pct(ci.lo)} đến ${pct(ci.hi)}%, ${n} phiên${target != null ? `, đích ${target}%` : ""}${compare ? `, ${compare.label} ${pct(compare.v, 1)}%` : ""}`;
  return (
    <span className="block" data-testid={testId} aria-label={sr} role="img">
      <span className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-200">{pct(value, 1)}% <span className="text-slate-500">[{pct(ci.lo)}–{pct(ci.hi)}]</span></span>
      </span>
      <span aria-hidden className="relative mt-1 block h-2 rounded-full bg-white/[0.06]">
        <i className="absolute inset-y-0 rounded-full" style={{ left: `${ci.lo}%`, width: `${Math.max(1, ci.hi - ci.lo)}%`, background: hit === false ? "rgba(244,122,132,0.35)" : "rgba(124,180,245,0.35)" }} />
        {target != null && <i className="absolute -inset-y-0.5 w-px bg-amber-300" style={{ left: `${target}%` }} />}
        {compare && <i className="absolute -inset-y-0.5 w-px border-l border-dashed border-slate-400" style={{ left: `${compare.v}%` }} />}
        <i className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0b1120] bg-slate-100" style={{ left: `${value}%` }} />
      </span>
    </span>
  );
}
