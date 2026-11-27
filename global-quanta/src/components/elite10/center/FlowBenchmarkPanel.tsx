// G2 (18/11/2026) — tab 4 "Bằng chứng & sổ theo dõi": danh mục ĐỐI CHỨNG Elite dòng tiền (E3, xếp theo Điểm Elite Z) — chuyển từ Bảng
// quyết định sang đây. Vẫn dựng và chấm sổ mỗi phiên tới mốc đánh giá cuối 01/2027; KHÔNG phải danh mục để giao dịch.
import { useMemo } from "react";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { hlPicks } from "../../../lib/elite10/decisionTypes";
import { TierChip } from "./DecisionBoard";
import { fmtDate, num, signed } from "./boardParts";

export default function FlowBenchmarkPanel() {
  const { data: d } = useEliteDecision();
  const { data: ws } = useWorldStrategy();
  const sector = useMemo(() => new Map((ws?.short.rows ?? []).map((r) => [r.icb, r.nameVi])), [ws]);
  const flow = d?.flowPortfolio ?? [];
  const hlSet = useMemo(() => new Set(d ? hlPicks(d).map((p) => p.ticker) : []), [d]);
  if (!d?.hl || !flow.length) return null;
  const overlap = flow.filter((p) => hlSet.has(p.ticker)).length;
  const c = d.flowConstruction;
  return (
    <section className="space-y-2 rounded-lg border border-white/10 bg-[#0E131F] p-3" data-testid="flow-benchmark">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">Danh mục đối chứng — Elite dòng tiền (E3, xếp theo Điểm Elite Z)</h4>
        <span className="text-[10px] text-slate-500">{d.flowVersion ?? "E3"} · phiên {fmtDate(d.date)}</span>
      </div>
      <p className="text-[10.5px] text-slate-400" data-testid="flow-benchmark-note">
        Danh mục chính thức là <b className="text-slate-200">Elite HL</b> từ 12/11/2026. Danh mục này vẫn được dựng và chấm sổ riêng mỗi phiên để làm đối chứng tới mốc đánh giá cuối 01/2027 — không dùng để giao dịch.
        Trùng với Elite HL: <b className="text-slate-200" data-testid="flow-benchmark-overlap">{overlap}/{flow.length}</b> mã.
      </p>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 480 }} data-testid="flow-benchmark-table">
          <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">Hạng Z</th><th className="font-normal">Mã</th><th className="font-normal">Ngành</th><th className="text-right font-normal">Z</th><th className="text-right font-normal">Tỷ trọng</th><th className="text-right font-normal">α 5 phiên</th><th className="font-normal">Trong Elite HL</th></tr></thead>
          <tbody>
            {flow.map((p) => (
              <tr key={p.ticker} className="border-t border-white/5">
                <td className="py-1 pr-2 font-mono text-slate-400">{p.rank ?? "—"}</td>
                <td className="pr-2 font-bold text-slate-100">{p.ticker}</td>
                <td className="pr-2 text-slate-400">{p.sectorKey ? sector.get(p.sectorKey) ?? p.sectorKey : "—"}</td>
                <td className="pr-2 text-right font-mono">{num(p.Z, 2)}</td>
                <td className="pr-2 text-right font-mono">{num(p.weight * 100, 1)}%</td>
                <td className="pr-2 text-right font-mono">{p.alpha5Pct == null ? "—" : `${signed(p.alpha5Pct, 2)}%`}</td>
                <td className={hlSet.has(p.ticker) ? "text-emerald-300" : "text-slate-500"}>{hlSet.has(p.ticker) ? "có" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c && <p className="text-[10px] text-slate-500">Xây danh mục E3: {c.method === "erc" ? "đóng góp rủi ro bằng nhau (ERC)" : "nghịch biến động"}; vùng đệm giữ {c.retained}/{c.previous} mã{c.turnover != null ? `, vòng quay ${num(c.turnover * 100, 0)}%` : ""}.</p>}
      <details className="text-[11px]" data-testid="flow-benchmark-weights">
        <summary className="cursor-pointer text-slate-300">Tín hiệu có trọng số của Điểm Elite Z (bậc A/B) · IC tổ hợp {num(d.icComb, 3)}</summary>
        <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="mt-1 overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">Tín hiệu</th><th className="font-normal">Bậc</th><th className="text-right font-normal">IC đo</th><th className="text-right font-normal">IC hậu nghiệm</th><th className="text-right font-normal">Trọng số</th></tr></thead>
            <tbody>
              {d.weights.map((w) => (
                <tr key={w.id} className="border-t border-white/5">
                  <td className="py-1 pr-2"><span className="text-slate-100">{w.labelVi}</span> <span className="text-slate-500">· {w.tab}</span></td>
                  <td className="pr-2"><TierChip tier={w.tier} /></td>
                  <td className="pr-2 text-right font-mono">{w.n ? signed(w.icMeas, 4) : "—"}</td>
                  <td className="pr-2 text-right font-mono">{num(w.icPost, 4)}</td>
                  <td className="text-right font-mono">{num(w.w * 100, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Điểm Elite Z vẫn là bối cảnh trong Hồ sơ 360° (hạng, α, P vượt); Elite HL không chọn mã theo Z.</p>
      </details>
    </section>
  );
}
