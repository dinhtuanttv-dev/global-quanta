// K6 (06/11/2026) — định dạng số cho KQKD theo quý (tỷ đồng, %, tăng trưởng có kiểm soát) + xuất CSV.
import type { Growth, GrowthStatus, KqkdRow, Tpl } from "./types";

export const TPL_LABEL: Record<Tpl, string> = { corp: "Doanh nghiệp", bank: "Ngân hàng", sec: "Chứng khoán", ins: "Bảo hiểm" };
export const TPL_SHORT: Record<Tpl, string> = { corp: "DN", bank: "NH", sec: "CK", ins: "BH" };
export const STATUS_VI: Partial<Record<GrowthStatus, { t: string; cls: string; title: string }>> = {
  LOW_BASE: { t: "nền thấp", cls: "text-amber-300 border-amber-400/40", title: "Kỳ gốc quá nhỏ: % tăng trưởng không có ý nghĩa" },
  TURNAROUND: { t: "lỗ → lãi", cls: "text-emerald-300 border-emerald-400/40", title: "Từ lỗ cùng kỳ sang lãi" },
  TO_LOSS: { t: "lãi → lỗ", cls: "text-rose-300 border-rose-400/40", title: "Từ lãi cùng kỳ sang lỗ" },
  LOSS: { t: "lỗ", cls: "text-rose-300 border-rose-400/40", title: "Lỗ cả hai kỳ" },
  NA: { t: "thiếu", cls: "text-slate-400 border-white/15", title: "Thiếu số liệu" },
};
export const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export const pct = (x: number | null | undefined, d = 0) => (!fin(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
export const pctPlain = (x: number | null | undefined, d = 1) => (!fin(x) ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
export const num = (x: number | null | undefined, d = 2) => (!fin(x) ? "—" : x.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
/** Tỷ đồng: ≥ 100 tỷ không lẻ, nhỏ hơn 1 chữ số lẻ. */
export const bn = (x: number | null | undefined, unit = true) => (!fin(x) ? "—" : `${(x / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) >= 1e11 ? 0 : 1 })}${unit ? " tỷ" : ""}`);
export const tone = (x: number | null | undefined) => (!fin(x) ? "text-slate-400" : x > 0 ? "text-emerald-300" : x < 0 ? "text-rose-300" : "text-slate-300");
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Văn bản tăng trưởng có kiểm soát: % khi NORMAL (≥ +300% ghi rõ số thô), nhãn khi nền thấp / đổi dấu. */
export function growthText(g: Growth | null | undefined, d = 0): { text: string; cls: string; title?: string } {
  if (!g) return { text: "—", cls: "text-slate-500" };
  if (g.status === "NORMAL") {
    const capped = g.raw != null && g.value != null && g.raw !== g.value;
    return { text: capped ? `≥ ${pct(g.value, d)}` : pct(g.value, d), cls: tone(g.value), title: capped ? `Tăng trưởng thô ${pct(g.raw, 0)} (giới hạn hiển thị −100% … +300%)` : undefined };
  }
  const s = STATUS_VI[g.status];
  return { text: s?.t ?? "—", cls: s?.cls.split(" ")[0] ?? "text-slate-500", title: [s?.title, g.raw != null ? `thô ${pct(g.raw, 0)}` : null].filter(Boolean).join(" · ") };
}

/** CSV (dấu ; cho Excel tiếng Việt, BOM UTF-8). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* trình duyệt chặn tải xuống */ }
}
export function summaryCsv(rows: KqkdRow[]): string {
  const g = (x: Growth | null | undefined) => (x?.status === "NORMAL" && fin(x.value) ? Math.round(x.value * 1000) / 10 : x?.status ?? "");
  return toCsv(
    ["Mã", "Mẫu", "Quý", "Ngày công bố", "Doanh thu quý (tỷ)", "LNST mẹ quý (tỷ)", "LN cốt lõi quý (tỷ)", "LNST YoY %", "LN cốt lõi YoY %", "Lũy kế tới quý", "LNST lũy kế (tỷ)", "Lũy kế YoY %", "TTM YoY %",
      "% LNTT ngoài cốt lõi", "Biên ròng TTM %", "ROE %", "Dồn tích Sloan %", "CFO/LNST", "Piotroski F", "Beneish M", "Altman Z''", "SUE LNST", "SUE cốt lõi", "Ước LNST cả năm YoY %"],
    rows.map((r) => [r.t, TPL_LABEL[r.tpl], r.quarter, r.created, fin(r.top) ? Math.round(r.top / 1e8) / 10 : "", fin(r.npat) ? Math.round(r.npat / 1e8) / 10 : "", fin(r.core) ? Math.round(r.core / 1e8) / 10 : "",
      g(r.npatYoY), g(r.coreYoY), r.ytd ? `${r.ytd.to * 3}T` : "", fin(r.ytd?.now) ? Math.round(r.ytd!.now! / 1e8) / 10 : "", g(r.ytd?.growth), g(r.ttmGrowth),
      fin(r.nonCoreShare) ? Math.round(r.nonCoreShare * 1000) / 10 : "", fin(r.netMarginTtm) ? Math.round(r.netMarginTtm * 1000) / 10 : "", fin(r.roe) ? Math.round(r.roe * 1000) / 10 : "",
      fin(r.accrual) ? Math.round(r.accrual * 1000) / 10 : "", r.cfoToNpat ?? "", r.f ?? "", r.m ?? "", r.z ?? "", r.sueNpat ?? "", r.sueCore ?? "", fin(r.nowcast?.growth) ? Math.round(r.nowcast!.growth! * 1000) / 10 : ""]),
  );
}
