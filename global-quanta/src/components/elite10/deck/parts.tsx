// Command Deck — thành phần nền: dấu bằng chứng, thang đo có vạch, thanh LS-v1 có ngưỡng, chấm mô hình TA, dải biến động.
// Chỉ trình bày; số liệu và ngưỡng do nơi gọi truyền vào (deckModel.ts).
import "./deck.css";
import type { ReactNode } from "react";
import type { Seal, SealTone } from "../../../lib/elite10/deckModel";

const SEAL_CLS: Record<SealTone, string> = {
  pass: "border-emerald-400/70 text-emerald-300", partial: "border-amber-400/70 text-amber-300",
  fail: "border-rose-400/70 text-rose-300", desc: "border-slate-400/60 text-slate-300",
};
export function EvidenceSeal({ seal, testId }: { seal: Seal; testId?: string }) {
  return <span title={seal.title} className={`inline-flex items-center rounded border px-2 py-0.5 text-[10.5px] font-bold tracking-wider ${SEAL_CLS[seal.tone]}`} style={{ fontFamily: "var(--font-display)" }} data-testid={testId}>{seal.text}</span>;
}

export const DeckLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500" style={{ fontFamily: "var(--font-display)" }}>{children}</p>
);

export function DeckPanel({ title, meta, children, testId, className = "" }: { title: string; meta?: ReactNode; children: ReactNode; testId?: string; className?: string }) {
  return (
    <section className={`deck-panel rounded-xl p-3 ${className}`} data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11.5px] font-semibold uppercase tracking-[.1em] text-slate-100" style={{ fontFamily: "var(--font-display)" }}>{title}</h4>
        {meta && <span className="text-[10.5px] text-slate-500">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/** Thang ngang 0–1 với phần tô và các vạch có nhãn. */
export function Scale({ value, fill, ticks = [], title }: { value: number; fill: string; ticks?: { at: number; label: string }[]; title?: string }) {
  return (
    <div className="relative mb-4 mt-3 h-2 rounded bg-white/10" title={title} aria-hidden="true">
      <div className="deck-grow absolute inset-y-0 left-0 rounded" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: fill }} />
      {ticks.map((t) => (
        <span key={t.label} className="absolute -bottom-1 -top-1 w-px bg-slate-500" style={{ left: `${t.at * 100}%` }}>
          <span className="absolute top-3.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-500">{t.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Thanh LS-v1 phân vị (0–100) với vạch ngưỡng bán và vạch cảnh báo. */
export function LsGauge({ ls, exit, warn }: { ls: number | null; exit: number; warn: number }) {
  const v = ls ?? 0, tone = v < exit ? "#F43F5E" : v < warn ? "#F59E0B" : "#10B981";
  return (
    <span className="relative mt-1 block h-1.5 w-[110px] rounded bg-white/10" title={`LS-v1 phân vị ${ls == null ? "—" : Math.round(v)}; vạch đỏ = ngưỡng bán ${exit}, vạch vàng = cảnh báo ${warn}`} aria-hidden="true">
      <span className="deck-grow absolute inset-y-0 left-0 rounded" style={{ width: `${v}%`, background: tone }} />
      <span className="absolute -bottom-0.5 -top-0.5 w-px bg-rose-400" style={{ left: `${exit}%` }} />
      <span className="absolute -bottom-0.5 -top-0.5 w-px bg-amber-400" style={{ left: `${warn}%` }} />
    </span>
  );
}

export function TaDots({ n, of }: { n: number; of: number }) {
  return (
    <span className="mt-1 inline-flex gap-[3px] align-middle" title={`Mô hình TA đạt ${n}/${of}`} aria-label={`Mô hình TA đạt ${n}/${of}`}>
      {Array.from({ length: of }, (_, i) => <span key={i} className={`h-[7px] w-[7px] rounded-full border ${i < n ? "border-[var(--info)] bg-[var(--info)]" : "border-white/20 bg-white/5"}`} />)}
    </span>
  );
}

const vn = (v: number, d = 1) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−");
/** Dải biến động: trục ±3 dải quanh giá lúc vào; vạch "−2 dải" (tính từ giá lúc vào); điểm = giá hiện tại. Mô tả, không phải lệnh. */
export function VolCorridor({ ret, band, testId }: { ret: number | null | undefined; band: number; testId?: string }) {
  const W = 140, H = 28, u = ret == null ? 0 : Math.max(-3, Math.min(3, ret / band)), X = (v: number) => 8 + (v + 3) / 6 * (W - 16);
  const label = ret == null ? "Chưa có giá lúc vào" : `Từ lúc vào ${ret > 0 ? "+" : ""}${vn(ret * 100)}%, bằng ${vn(ret / band, 2)} lần dải biến động 20 phiên (${vn(band * 100)}%)`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-7 w-[140px]" role="img" aria-label={label} data-testid={testId}>
      <title>{label} — mô tả, không phải lệnh cắt lỗ</title>
      <rect x="8" y="12" width={W - 16} height="4" rx="2" fill="#1E273D" />
      <rect x={X(-3)} y="12" width={X(-2) - X(-3)} height="4" fill="rgba(244,63,94,.45)" />
      <line x1={X(0)} y1="6" x2={X(0)} y2="22" stroke="#94A3B8" strokeWidth="1" />
      <line x1={X(-2)} y1="8" x2={X(-2)} y2="20" stroke="#F43F5E" strokeWidth="1" strokeDasharray="2 2" />
      {ret != null && <circle cx={X(u)} cy="14" r="4" fill={u >= 0 ? "#10B981" : "#F43F5E"} stroke="#080B11" strokeWidth="1.5" />}
    </svg>
  );
}
