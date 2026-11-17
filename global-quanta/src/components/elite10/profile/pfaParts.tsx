// PFA-v1 — phần dùng chung của Hồ sơ 360° · Doanh nghiệp & Sự kiện: định dạng số kiểu Việt Nam, thẻ, nhãn bằng chứng, danh sách cảnh báo.
import type { ReactNode } from "react";
import type { PfaWarning, PfaYoY } from "../../../lib/elite10/profileFaTypes";
import { FA_R1 } from "../../../lib/elite10/faR1";

export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);
export const spct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v) * 100, d)}%`);
/** Tỷ đồng, có dấu khi âm. */
export const bn = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${Math.round(Math.abs(v) / 1e9).toLocaleString("vi-VN")} tỷ`);
export const vnd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("vi-VN")}đ`);
export const tone = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v === 0 ? "text-slate-200" : v > 0 ? "text-emerald-300" : "text-rose-300");

/** Tăng trưởng có trạng thái (TURNAROUND / LOW_BASE / NA…) — không hiện % vô nghĩa khi gốc âm hoặc quá nhỏ. */
const YOY_STATUS: Record<string, string> = { TURNAROUND: "chuyển lãi", LOSS: "lỗ", LOW_BASE: "gốc thấp", NA: "chưa có", NEW_LOSS: "chuyển lỗ" };
export function YoY({ v }: { v: PfaYoY | null | undefined }) {
  if (!v) return <span className="text-slate-500">—</span>;
  if (v.status !== "NORMAL" || v.value == null) return <span className="text-slate-400">{YOY_STATUS[v.status] ?? v.status}</span>;
  return <span className={tone(v.value)}>{spct(v.value)}</span>;
}

/** Nhãn bằng chứng — luôn hiện cạnh số liệu. */
export function Evidence({ label, title }: { label: "ĐẠT" | "THĂM DÒ" | "MÔ TẢ" | "KHÔNG ĐẠT" | "KHÔNG ÁP DỤNG" | string; title?: string }) {
  const cls = label === "ĐẠT" ? "border-emerald-400/50 text-emerald-300" : label === "THĂM DÒ" ? "border-amber-400/50 text-amber-300" : label === "KHÔNG ĐẠT" ? "border-rose-400/50 text-rose-300" : "border-slate-500/50 text-slate-400";
  return <span title={title} className={`ml-1 inline-block whitespace-nowrap rounded border px-1 py-px align-middle text-[10px] font-bold ${cls}`}>{label}</span>;
}

export function Block({ title, right, children, testId }: { title: string; right?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Ô số liệu: nhãn trên, giá trị dưới, ghi chú nhỏ. */
export function Stat({ label, children, sub, testId }: { label: string; children: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5" data-testid={testId}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-[13px] font-bold tabular-nums text-slate-100">{children}</p>
      {sub && <p className="text-[10px] leading-snug text-slate-500">{sub}</p>}
    </div>
  );
}

/** Danh sách kiểm (đạt / không đạt / chưa có). */
export function Checklist({ items, testId }: { items: { id: string; label: string; pass: boolean | null }[]; testId: string }) {
  return (
    <ul className="space-y-0.5 text-[11px]" data-testid={testId}>
      {items.map((t) => (
        <li key={t.id} className={t.pass === true ? "text-emerald-300" : t.pass === false ? "text-slate-400" : "text-slate-600"}>
          <span aria-hidden="true">{t.pass === true ? "✓" : t.pass === false ? "✗" : "·"}</span> {t.label}<span className="sr-only">{t.pass === true ? " — đạt" : t.pass === false ? " — không đạt" : " — chưa có dữ liệu"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Cảnh báo pha B — mô tả, không phải lệnh. Biểu tượng + chữ (không chỉ dựa vào màu). */
export function WarningList({ items, compact = false, testId }: { items: PfaWarning[] | null | undefined; compact?: boolean; testId: string }) {
  if (!items?.length) return compact ? null : <p className="text-[11px] text-slate-400" data-testid={testId}><span className="mr-1 text-emerald-300">●</span>Không có cảnh báo cơ bản hay sự kiện.</p>;
  if (compact) {
    return (
      <span className="flex flex-wrap gap-1" data-testid={testId}>
        {items.map((w) => <span key={w.id} title={`${w.text} · ${w.source}`} className={`rounded border px-1 py-px text-[10px] ${w.level === "warn" ? "border-amber-400/50 text-amber-300" : "border-slate-500/50 text-slate-400"}`}>{w.level === "warn" ? "⚠ " : "ⓘ "}{WARN_SHORT[w.id] ?? w.id}</span>)}
      </span>
    );
  }
  return (
    <ul className="space-y-1 text-[11px]" data-testid={testId}>
      {items.map((w) => (
        <li key={w.id} className={w.level === "warn" ? "text-amber-200" : "text-slate-300"}>
          <span aria-hidden="true">{w.level === "warn" ? "⚠ " : "ⓘ "}</span>{w.text} <span className="text-[10px] text-slate-500">· {w.source}</span>
          {FA_R1.gates[w.id] && <span className="block pl-4 text-[10px] text-slate-500" data-testid={`pfa-far1-${w.id}`}>FA-r1 {FA_R1.gates[w.id].gate}: chặn mua theo cờ này {FA_R1.gates[w.id].vsBase20 >= 0 ? "+" : "−"}{Math.abs(FA_R1.gates[w.id].vsBase20 * 100).toFixed(2).replace(".", ",")}% / 20 phiên so với không chặn (t {FA_R1.gates[w.id].t.toLocaleString("vi-VN")}) — {FA_R1.gates[w.id].noteVi}</span>}
        </li>
      ))}
    </ul>
  );
}
export const WARN_SHORT: Record<string, string> = {
  LOSS_TTM: "Lỗ 4 quý", PIOTROSKI_LOW: "Piotroski thấp", BENEISH: "Beneish", ALTMAN: "Altman rủi ro", ACCRUAL: "Dồn tích cao", NEG_CFO: "Dòng tiền âm",
  AUDIT_DIFF: "Lệch kiểm toán", NON_CORE: "LN ngoài cốt lõi", STOCK_EX_SOON: "Sắp GDKHQ cổ phiếu", CASH_EX_SOON: "Sắp GDKHQ tiền", RIGHTS_SOON: "Quyền mua",
  KQKD_SOON: "Sắp có KQKD", STATUS_WARNING: "Diện cảnh báo", STATUS_CONTROL: "Diện kiểm soát", STATUS_HALT: "Hạn chế GD", STATUS_NOTICE: "Nhắc CBTT", STATUS_NO_MARGIN: "Không ký quỹ", STATUS_DELIST: "Huỷ niêm yết",
};
