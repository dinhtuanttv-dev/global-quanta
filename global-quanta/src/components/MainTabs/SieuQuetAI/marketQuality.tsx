// Chất lượng số liệu cho các bảng thị trường (PR-A, MARKET_CENTER_UPGRADE_PLAN.md §3).
// Chỉ định dạng và đánh giá độ tin cậy từ dữ liệu API đã có; không tính lại số nghiệp vụ.
import type { PreopenDoc, ScenarioId } from "../../../hooks/usePreopen";

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
