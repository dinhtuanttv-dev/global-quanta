// AGM-v1 (06/11/2026) — Kế hoạch ĐHĐCĐ & tiến độ hoàn thành. Nguồn: nghị quyết / biên bản ĐHĐCĐ thường niên (công bố thông tin trên VNDirect),
// thường là bản scan -> 2 mô hình AI chép độc lập + code kiểm (con số có trong cả hai bản chép, đúng năm, hợp lý so BCTC). Nhãn MÔ TẢ.
import { bn, dmy, fin, pctPlain } from "../../../../lib/kqkd/format";
import type { KqkdDetail, PlanItem } from "../../../../lib/kqkd/types";

const LABEL: Record<string, string> = { revenue: "Doanh thu", pbt: "Lợi nhuận trước thuế", npat: "Lợi nhuận sau thuế" };
const BASIS: Record<string, string> = { consolidated: "hợp nhất", separate: "riêng lẻ", parent: "cổ đông công ty mẹ", unknown: "không ghi cơ sở" };

function Bar({ done, typical, label }: { done: number; typical: number | null; label: string }) {
  const w = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  return (
    <div className="space-y-1" data-testid="agm-bar">
      <div className="relative h-4 rounded-sm bg-white/[0.05]" role="img" aria-label={`${label}: đã đạt ${pctPlain(done, 0)} kế hoạch${fin(typical) ? `, mọi năm thường đạt ${pctPlain(typical, 0)} vào thời điểm này` : ""}`}>
        <span className={`absolute left-0 top-0 h-full rounded-sm ${fin(typical) && done >= typical ? "bg-emerald-400/80" : "bg-[#E8B84B]/80"}`} style={{ width: w(done) }} />
        {fin(typical) && <span className="absolute -top-1 h-6 w-[2px] bg-slate-200" style={{ left: w(typical) }} title="Tỷ trọng lũy kế mùa vụ thường lệ" />}
        <span className="absolute left-0 top-0 h-full w-full border-r-2 border-dashed border-white/30" />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500"><span>0%</span>{fin(typical) && <span>vạch trắng = mọi năm thường đạt {pctPlain(typical, 0)} tới lúc này</span>}<span>100% kế hoạch</span></div>
    </div>
  );
}

export default function AgmPlanPanel({ d }: { d: KqkdDetail }) {
  const p = d.plan;
  if (!p) return <p className="text-[11px] text-slate-400" data-testid="agm-none">Chưa có kế hoạch ĐHĐCĐ năm {d.latest.quarter.slice(3)} đã đọc được (chưa có nghị quyết trên công bố thông tin, hoặc đang chờ lượt đọc).</p>;
  const a = p.attainment;
  const items = (["revenue", "pbt", "npat"] as const).map((k) => [k, p.items[k]] as [string, PlanItem]).filter(([, x]) => x && x.status !== "ABSENT");
  return (
    <div className="space-y-3" data-testid="agm-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-[#F5CE72]">Kế hoạch kinh doanh {p.year} {p.draft ? "(tờ trình, chưa có nghị quyết)" : p.approved ? "— ĐHĐCĐ đã thông qua" : "— chưa xác nhận đã thông qua"}</p>
          <p className="text-[10.5px] text-slate-400">Nguồn: <a href={p.doc.url} target="_blank" rel="noreferrer noopener" className="text-sky-300 hover:underline">{p.doc.title}</a> ({dmy(p.doc.date)}) · đọc ngày {dmy(p.at)}</p>
        </div>
        <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title="Bản scan: 2 mô hình AI chép độc lập, code kiểm con số có trong cả hai bản chép, đúng năm, hợp lý so BCTC">MÔ TẢ · 2 AI + code</span>
      </div>

      {a && (
        <div className="rounded-lg border border-[#E8B84B]/25 bg-[#E8B84B]/[0.05] p-3" data-testid="agm-attain">
          <p className="text-[11px] font-bold text-slate-200">Tiến độ {LABEL[a.metric]} ({BASIS[a.basis] ?? a.basis}) — lũy kế {a.through === 4 ? "cả năm" : `${a.through * 3} tháng`}</p>
          <div className="my-2 flex flex-wrap items-end gap-6">
            <div><p className="text-[10px] uppercase text-slate-500">Đã đạt</p><p className="font-mono text-[20px] font-bold tabular-nums text-slate-100">{pctPlain(a.done, 1)}</p><p className="text-[10px] text-slate-500">{bn(a.ytd)} / {bn(a.plan)}</p></div>
            {fin(a.pace) && <div><p className="text-[10px] uppercase text-slate-500">So với mùa vụ thường lệ</p><p className={`font-mono text-[20px] font-bold tabular-nums ${a.pace >= 1 ? "text-emerald-300" : "text-amber-300"}`}>{a.pace >= 1 ? "nhanh hơn" : "chậm hơn"} {pctPlain(Math.abs(a.pace - 1), 0)}</p><p className="text-[10px] text-slate-500">đạt ÷ tỷ trọng lũy kế trung vị {pctPlain(a.typical, 0)}</p></div>}
            {fin(a.nowcastVsPlan) && <div><p className="text-[10px] uppercase text-slate-500">Ước cả năm / kế hoạch</p><p className={`font-mono text-[20px] font-bold tabular-nums ${a.nowcastVsPlan >= 1 ? "text-emerald-300" : "text-amber-300"}`}>{pctPlain(a.nowcastVsPlan, 0)}</p><p className="text-[10px] text-slate-500">ngoại suy mùa vụ (THĂM DÒ, dải hẹp hơn thực tế)</p></div>}
          </div>
          <Bar done={a.done} typical={a.typical} label={LABEL[a.metric]} />
        </div>
      )}

      <table className="w-full text-[11px]" data-testid="agm-items">
        <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="px-1 py-1">Chỉ tiêu</th><th className="px-1 py-1 text-right">Kế hoạch {p.year}</th><th className="px-1 py-1 text-right">So năm trước (BCTC)</th><th className="px-1 py-1">Kiểm chứng</th><th className="px-1 py-1">Trích từ văn bản</th></tr></thead>
        <tbody>
          {items.map(([k, x]) => (
            <tr key={k} className="align-top" data-testid={`agm-item-${k}`}>
              <td className="border-t border-white/[0.06] px-1 py-1.5 text-slate-200">{LABEL[k]}<span className="block text-[10px] text-slate-500">{BASIS[x.basis ?? "unknown"]}</span></td>
              <td className="border-t border-white/[0.06] px-1 py-1.5 text-right font-mono tabular-nums text-slate-100">{bn(x.vnd ?? null)}</td>
              <td className="border-t border-white/[0.06] px-1 py-1.5 text-right font-mono tabular-nums text-slate-300">{fin(x.ratioPrior) ? `${x.ratioPrior >= 1 ? "+" : "−"}${pctPlain(Math.abs(x.ratioPrior - 1), 1)}` : "—"}</td>
              <td className="border-t border-white/[0.06] px-1 py-1.5">
                <span className={`rounded border px-1 text-[10px] font-bold ${x.status === "VERIFIED" ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}>{x.status === "VERIFIED" ? "đã kiểm" : "cần soát"}</span>
                {x.reason && <span className="block text-[10px] text-amber-300">{x.reason}</span>}
                {x.status === "VERIFIED" && x.sameScope === false && <span className="block text-[10px] text-sky-300" title="Kế hoạch có thể theo phạm vi khác BCTC hợp nhất (công ty mẹ, riêng lẻ, một phần mảng) nên không dùng để tính tiến độ">khác phạm vi BCTC — không tính tiến độ</span>}
                {x.priorCheck && !x.priorCheck.match && <span className="block text-[10px] text-slate-400" title="Số năm trước in trong bảng kế hoạch khác BCTC hợp nhất: kế hoạch có thể theo phạm vi khác (riêng lẻ, mảng, trước điều chỉnh)">số năm trước in trong bảng lệch BCTC {pctPlain(x.priorCheck.diff, 0)}: có thể khác phạm vi</span>}
              </td>
              <td className="border-t border-white/[0.06] px-1 py-1.5 text-[10.5px] italic text-slate-400">{x.quote ? `“${x.quote}”` : "—"}{x.page ? <span className="not-italic text-slate-500"> · tr. {x.page}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-500">
        Nghị quyết ĐHĐCĐ thường là bản scan có chữ ký nên không đối chiếu câu chữ bằng code được. Cách kiểm: hai mô hình AI khác nhau ({p.models.join(", ")}) chép độc lập phần kế hoạch;
        con số chỉ được nhận khi có trong cả hai bản chép, đúng năm {p.year}, có đơn vị, và nằm trong 0,2–5 lần thực hiện năm trước theo BCTC. "Cần soát" không dùng để tính tiến độ.
        Tiến độ dùng đúng chỉ tiêu của kế hoạch (LNST hợp nhất so LNST hợp nhất, LNST mẹ so LNST mẹ) và chỉ khi cùng phạm vi BCTC (số năm trước in trong bảng khớp BCTC ±3%, hoặc kế hoạch trong 0,5–2,5 lần năm trước). Bấm link để tự kiểm văn bản gốc.
      </p>
    </div>
  );
}
