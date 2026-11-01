"use client";
// Thẻ MS-GARCH trong dock Chỉ báo: trạng thái biến động, dải rủi ro và so với mô hình đơn giản. Mô tả rủi ro, không phải tín hiệu.
import type { MsGarchBand, MsGarchDoc } from "../../../hooks/useMsGarchBands";
import ProvenanceBadge from "./ProvenanceBadge";

export const MS_GARCH_DAYS = [5, 10, 20] as const;
export const REGIME_VI = { calm: "Yên tĩnh", volatile: "Biến động" } as const;
const price = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
const pct = (v: number, d = 1) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (ratio: number) => { const p = (ratio - 1) * 100; return `${p > 0 ? "+" : p < 0 ? "−" : ""}${pct(Math.abs(p))}%`; };
const at = (rows: MsGarchBand[] | undefined, d: number) => rows?.find((x) => x.day === d) ?? null;

export default function MsGarchCard({ on, onEnable, doc, error, loading, dailyOnly, close, validation }: {
  on: boolean; onEnable: () => void; doc: MsGarchDoc | null; error?: Error; loading: boolean; dailyOnly: boolean; close: number | null; validation: string;
}) {
  const r = doc?.regime;
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] text-slate-300" aria-label="MS-GARCH" data-testid="msgarch-card">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[12px] font-bold text-slate-100">MS-GARCH · dải rủi ro 20 phiên</h3>
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-500/40 text-[10px] font-bold text-amber-300" title="Không đạt kiểm định đặt trước">C</span>
        <ProvenanceBadge kind="INFERRED" />
      </div>
      {!on ? (
        <button type="button" onClick={onEnable} data-testid="msgarch-enable" className="mt-2 rounded border border-cyan-500/40 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10">Bật lớp MS-GARCH trên chart</button>
      ) : dailyOnly ? (
        <p className="mt-2" data-testid="msgarch-daily-only">Chỉ có ở khung ngày và không hiện khi đang xem lại lịch sử.</p>
      ) : error ? (
        <p className="mt-2 text-amber-300" role="alert">Chưa tính được: {error.message}</p>
      ) : loading || !doc ? (
        <p className="mt-2 text-slate-400">Đang tính…</p>
      ) : !doc.available ? (
        <p className="mt-2" data-testid="msgarch-unavailable">{doc.reason}</p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px]" data-testid="msgarch-regime">
            <b className={r?.label === "volatile" ? "text-amber-200" : "text-slate-100"}>{r ? REGIME_VI[r.label] : "—"}</b>
            {r && <span className="text-slate-400"> · xác suất {pct(Math.max(r.probCalm, r.probVolatile) * 100, 0)}%</span>}
            <span className="text-slate-400"> · biến động {pct(doc.volAnnualPct ?? 0)}%/năm · phiên {doc.asOf?.slice(8, 10)}/{doc.asOf?.slice(5, 7)}</span>
          </p>
          <table className="mt-1.5 w-full max-w-[560px]" data-testid="msgarch-table">
            <thead><tr className="text-slate-400"><th className="text-left font-normal">Sau</th><th className="text-right font-normal">P10</th><th className="text-right font-normal">P50</th><th className="text-right font-normal">P90</th><th className="text-right font-normal">Mô hình đơn giản P10–P90</th></tr></thead>
            <tbody>{MS_GARCH_DAYS.map((d) => {
              const b = at(doc.bands, d), h = at(doc.baseline, d);
              if (!b) return null;
              const cell = (v: number) => <td className="text-right font-mono text-slate-100">{close ? price(close * v) : "—"} <span className="text-slate-400">{signed(v)}</span></td>;
              return <tr key={d} className="border-t border-white/5" data-testid={`msgarch-row-${d}`}><td>{d} phiên</td>{cell(b.p10)}{cell(b.p50)}{cell(b.p90)}<td className="text-right font-mono text-slate-400">{h ? `${signed(h.p10)} / ${signed(h.p90)}` : "—"}</td></tr>;
            })}</tbody>
          </table>
          {doc.warnings && doc.warnings.length > 0 && <ul className="mt-1.5 space-y-0.5 text-amber-300" data-testid="msgarch-warnings">{doc.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          <p className="mt-1.5 text-slate-400" data-testid="msgarch-validation">{validation} Dải cho biết độ rộng rủi ro, không dự báo chiều giá. Không phải khuyến nghị đầu tư.</p>
        </>
      )}
    </section>
  );
}
