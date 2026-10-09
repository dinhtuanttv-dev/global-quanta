// Thẻ bằng chứng SEPA (SP3) — kiểm định point-in-time với tiêu chí đặt trước; hiển thị nguyên số liệu, kể cả giả thuyết thất bại.
import { useState } from "react";
import type { SepaDoc, SepaStat } from "../../../hooks/useSepa";

const VERDICT: Record<string, [string, string]> = {
  PASS: ["ĐẠT", "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"],
  FAIL: ["KHÔNG ĐẠT", "bg-rose-500/10 text-rose-300 border-rose-500/30"],
  DESCRIPTIVE: ["mô tả", "bg-slate-500/10 text-slate-400 border-slate-600/40"],
};
const pct = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`);
const isStat = (s: unknown): s is SepaStat => !!s && typeof (s as SepaStat).n === "number" && typeof (s as SepaStat).mean === "number";
const stat = (s?: SepaStat) => (s ? `n ${s.n} · ${pct(s.mean)}${s.ci ? ` · KTC [${pct(s.ci[0])}; ${pct(s.ci[1])}]` : ""}` : "—");

export default function SepaEvidenceCard({ evidence }: { evidence: NonNullable<SepaDoc["evidence"]> }) {
  const [open, setOpen] = useState(false);
  const v = evidence.validation;
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2 space-y-1" data-testid="sepa-evidence">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[8.5px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300">{evidence.label}</span>
        <span className="text-[9.5px] text-slate-300 flex-1 min-w-[14rem]">{evidence.reason}</span>
        {v && (
          <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="text-[9px] text-emerald-300 hover:text-emerald-200" data-testid="sepa-evidence-toggle">
            {open ? "Ẩn chi tiết" : "Chi tiết kiểm định"}
          </button>
        )}
      </div>
      {open && v && (
        <div className="overflow-x-auto">
          <p className="text-[9px] text-slate-500">Kiểm định {v.version} · {v.period.sessions} phiên {v.period.from} → {v.period.to} · ngoài mẫu từ {v.period.oosFrom} · {v.rules}</p>
          <table className="w-full text-[9.5px] mt-1" data-testid="sepa-evidence-table">
            <thead><tr className="text-slate-500 text-left"><th className="py-0.5">Giả thuyết</th><th>Trong mẫu</th><th>Ngoài mẫu</th><th className="text-right">Kết luận</th></tr></thead>
            <tbody className="divide-y divide-slate-800/40">
              {v.hypotheses.map((h) => (
                <tr key={h.id} className="align-top">
                  <td className="py-1 pr-2"><b className="text-slate-200">{h.id}</b> <span className="text-slate-300">{h.label}</span>{h.caveat && <span className="block text-[8.5px] text-amber-300/80">{h.caveat}</span>}</td>
                  <td className="py-1 pr-2 font-mono text-slate-400 whitespace-nowrap">{h.is ? stat(h.is) : "—"}</td>
                  <td className="py-1 pr-2 font-mono text-slate-300">
                    {isStat(h.oos) ? stat(h.oos) : h.oos ? Object.entries(h.oos).map(([k, s]) => (
                      <span key={k} className="block whitespace-nowrap">{k}: {isStat(s) ? stat(s) : Object.entries(s as Record<string, number>).map(([a, b]) => `${a} ${b}`).join(" · ")}</span>
                    )) : "—"}
                  </td>
                  <td className="py-1 text-right"><span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${VERDICT[h.verdict][1]}`}>{VERDICT[h.verdict][0]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
