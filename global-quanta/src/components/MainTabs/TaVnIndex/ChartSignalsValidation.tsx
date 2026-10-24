"use client";
// R6 — kết quả kiểm định ĐẶT TRƯỚC tín hiệu chart trên VN100 (backend/src/market/chartSignals/CHART-SIGNALS-prereg.md).
// Số liệu sinh tự động (scripts/chart-signals-validate.mjs) vào chartSignalsReport.json — không sửa tay. Không đạt -> chỉ mô tả.
import report from "../../../lib/ta-command-center/validation/chartSignalsReport.json";

type Verdict = "PASS" | "FAIL" | "INSUFFICIENT";
interface Row {
  label: string; side: number; h: number; tf: string; verdict: Verdict; reason: string; q: number | null; placeboP: number | null;
  stability: { tickers: number; share: number | null }; IS: { n: number; mean: number | null }; OOS: { n: number; mean: number | null; ci: [number, number] | null; hit: number | null };
}
const R = report as unknown as { prereg: string; generatedAt: string; universe: number; data: { from: string; to: string }; results: Record<string, Row> };

const BADGE: Record<Verdict, { text: string; cls: string }> = {
  PASS: { text: "ĐÃ KIỂM ĐỊNH", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
  FAIL: { text: "THỰC NGHIỆM", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  INSUFFICIENT: { text: "THIẾU MẪU", cls: "text-slate-300 border-slate-500/40 bg-slate-500/10" },
};
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2).replace(".", ",")}%`);

/** Kết luận của một tín hiệu theo mã (C1…W4) — để chỗ khác (bảng chỉ báo) ghi đúng nhãn. */
export const chartSignalVerdict = (id: string): Verdict | null => (R.results[id]?.verdict as Verdict) ?? null;
export const anyChartSignalPassed = Object.values(R.results).some((r) => r.verdict === "PASS");

export default function ChartSignalsValidation() {
  const rows = Object.entries(R.results);
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3 mt-2" data-testid="chart-signals-validation">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
        Kiểm định tín hiệu chart · VN100 · ngoài mẫu
      </p>
      <p className="text-[9.5px] text-slate-500 mb-2 leading-relaxed">
        {R.universe} mã, {R.data.from} → {R.data.to}. Trong mẫu ≤ 2024, NGOÀI MẪU 2025–2026. Lợi suất VƯỢT TRỘI so với TB cùng ngày của tập mã,
        vào mở cửa T+1, tín hiệu mua trừ phí 0,6%. Tiêu chí đặt trước: KTC ngoài mẫu không chứa 0, cùng chiều trong mẫu, BH-FDR q ≤ 0,1,
        placebo p ≤ 0,1, ≥ 50% mã cùng chiều. {anyChartSignalPassed ? "" : <b className="text-amber-300">Chưa tín hiệu nào đạt — mọi tín hiệu trên chart chỉ là MÔ TẢ, không phải lợi thế.</b>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] min-w-[560px]">
          <thead className="text-slate-500 text-left">
            <tr><th className="py-1 pr-2">Tín hiệu</th><th className="pr-2">Kỳ hạn</th><th className="pr-2 text-right">Trong mẫu</th><th className="pr-2 text-right">Ngoài mẫu (KTC 95%)</th><th className="pr-2 text-right">q · placebo · % mã</th><th>Kết luận</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {rows.map(([id, r]) => (
              <tr key={id} data-testid={`csv-row-${id}`} title={r.reason}>
                <td className="py-1 pr-2 text-slate-200"><span className="font-mono text-slate-500">{id}</span> {r.label}</td>
                <td className="pr-2 text-slate-400 whitespace-nowrap">{r.h} phiên{r.side < 0 ? " · cảnh báo" : ""}</td>
                <td className="pr-2 text-right font-mono text-slate-300 whitespace-nowrap">{pct(r.IS.mean)} <span className="text-slate-600">n {r.IS.n}</span></td>
                <td className="pr-2 text-right font-mono whitespace-nowrap">
                  <span className={(r.OOS.mean ?? 0) * r.side > 0 ? "text-emerald-300" : "text-rose-300"}>{pct(r.OOS.mean)}</span>
                  <span className="text-slate-600"> [{r.OOS.ci ? `${pct(r.OOS.ci[0])}; ${pct(r.OOS.ci[1])}` : "—"}] n {r.OOS.n}</span>
                </td>
                <td className="pr-2 text-right font-mono text-slate-400 whitespace-nowrap">{r.q ?? "—"} · {r.placeboP ?? "—"} · {r.stability.share != null ? `${Math.round(r.stability.share * 100)}%` : "—"}</td>
                <td><span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-bold whitespace-nowrap ${BADGE[r.verdict].cls}`}>{BADGE[r.verdict].text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[8.5px] text-slate-600 mt-2">
        Cảnh báo (C2): dương = giá vẫn tăng hơn thị trường sau tín hiệu (cảnh báo sai chiều). Tiêu chí: {R.prereg} · chạy {R.generatedAt}.
        Rê chuột lên từng dòng để xem lý do không đạt.
      </p>
    </div>
  );
}
