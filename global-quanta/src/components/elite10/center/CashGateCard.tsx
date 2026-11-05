// CG-r1 (05/11/2026) — ô "Tỷ lệ cổ phiếu" của Bảng quyết định: tỷ lệ chính thức + trạng thái Cổng tiền mặt hôm nay (MÔ TẢ) +
// kết quả kiểm định đăng ký trước trên E1VFVN30 10/2014–10/2021. Không quy tắc nào đạt -> không gợi ý tỷ lệ tiền mặt.
import { useCashGate } from "../../../hooks/elite10/useEliteCenter";
import type { CashGateRuleId } from "../../../lib/elite10/decisionTypes";
import { fmtDate } from "./boardParts";

const RULE_VI: Record<CashGateRuleId, string> = {
  H1: "DOWNTREND + VIX > 25 → 30% (quy tắc chính)",
  H1b: "DOWNTREND + VIX > 25 → 50%",
  H2: "Nhắm mục tiêu biến động (30–100%)",
  H3: "VIX/VIX3M phẳng hoặc đảo ngược → 50%",
};
const REGIME_VI: Record<string, string> = { UPTREND: "Xu hướng tăng", DOWNTREND: "Xu hướng giảm", SIDEWAY: "Đi ngang" };
const pct = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const n2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function CashGateCard() {
  const { data: g, isLoading } = useCashGate();
  const ho = g?.holdout ?? null;
  const ids: CashGateRuleId[] = ["H1", "H1b", "H2", "H3"];
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 space-y-1.5" data-testid="elite-cash-gate">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[10px] font-bold uppercase text-slate-500">Tỷ lệ cổ phiếu</p>
        <span className="rounded border border-slate-500/40 px-1.5 text-[10px] font-bold text-slate-400" title="Cổng tiền mặt CG-r1 không đạt kiểm định đăng ký trước: trạng thái chỉ để mô tả, không đổi danh mục">CỔNG CG-r1 · MÔ TẢ</span>
      </div>
      <p data-testid="elite-cash-gate-official"><b className="text-slate-100">{pct(g?.official.equityShare ?? 1)}</b> — {g?.official.reasonVi ? g.official.reasonVi.replace(/^\d+%:\s*/, "") : "chưa có tín hiệu định thời thị trường nào đạt kiểm định, nên không đề xuất tỷ lệ tiền mặt."}</p>
      {isLoading && !g ? <p className="text-[10px] italic text-slate-500">Đang tải trạng thái cổng…</p> : !g ? (
        <p className="text-[10px] text-slate-500">Chưa lấy được trạng thái Cổng tiền mặt.</p>
      ) : (
        <>
          {g.stale && <p className="text-[10px] text-amber-300" data-testid="elite-cash-gate-stale" title={g.staleReason}>Số liệu của lần lấy gần nhất (nguồn tạm lỗi khi làm mới).</p>}
          <p className="text-[10px] text-slate-400" data-testid="elite-cash-gate-inputs">
            Phiên {fmtDate(g.asOf)}: VN-Index <b className="text-slate-200">{REGIME_VI[g.inputs.regime] ?? g.inputs.regime}</b> · VIX {n2(g.inputs.vix)} · VIX/VIX3M {g.inputs.volSlope == null ? "—" : `${g.inputs.volSlope >= 0 ? "+" : ""}${pct(g.inputs.volSlope, 1)}`} · biến động năm {pct(g.inputs.volAnnual, 1)} (mục tiêu {pct(g.inputs.volTargetAnnual, 1)})
          </p>
          <ul className="space-y-0.5 text-[10.5px]" data-testid="elite-cash-gate-rules">
            {ids.map((id) => {
              const r = g.rules[id];
              return (
                <li key={id} className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-400"><b className="text-slate-300">{id}</b> {RULE_VI[id]}</span>
                  <span className={`whitespace-nowrap font-mono ${r.active ? "text-amber-300" : "text-slate-500"}`}>{r.active ? `kích hoạt · ${pct(r.target)}` : "không kích hoạt"}</span>
                </li>
              );
            })}
          </ul>
          {ho && (
            <details className="text-[10px] text-slate-400" data-testid="elite-cash-gate-holdout">
              <summary className="cursor-pointer select-none text-slate-300">Kiểm định đăng ký trước: <b className={ho.passed.length ? "text-emerald-300" : "text-rose-300"}>{ho.passed.length ? `ĐẠT (${ho.passed.join(", ")})` : "KHÔNG ĐẠT"}</b> · {ho.period.sessions.toLocaleString("vi-VN")} phiên {fmtDate(ho.period.from)}–{fmtDate(ho.period.to)}</summary>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full table-fixed text-[10px]">
                  <thead><tr className="text-left text-slate-500"><th className="py-0.5 pr-2">Quy tắc</th><th className="pr-2 text-right">Lợi suất năm</th><th className="pr-2 text-right">Sụt giảm tối đa</th><th className="pr-2 text-right">ΔSharpe (p Holm)</th><th className="text-right">Tiêu chí</th></tr></thead>
                  <tbody className="font-mono">
                    <tr><td className="py-0.5 pr-2 font-sans">Luôn 100%</td><td className="pr-2 text-right">{pct(ho.base.cagr, 1)}</td><td className="pr-2 text-right">{pct(ho.base.mdd, 1)}</td><td className="pr-2 text-right">—</td><td /></tr>
                    {ids.map((id) => {
                      const r = ho.rules[id];
                      const marks = (["C1", "C2", "C3", "C4"] as const).map((c) => `${c}${r.criteria[c] ? "✓" : "✗"}`).join(" ");
                      return <tr key={id}><td className="py-0.5 pr-2 font-sans">{id}</td><td className="pr-2 text-right">{pct(r.cagr, 1)}</td><td className="pr-2 text-right">{pct(r.mdd, 1)}</td><td className="pr-2 text-right">{r.deltaSharpe >= 0 ? "+" : ""}{n2(r.deltaSharpe)} ({n2(r.pHolm)})</td><td className={`text-right ${r.pass ? "text-emerald-300" : ""}`}>{marks}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1">{ho.summaryVi} Đạt cần đủ C1 Sharpe tốt hơn có ý nghĩa (bootstrap, hiệu chỉnh Holm), C2 sụt giảm nông hơn ≥ 5 điểm %, C3 lợi suất năm không thấp hơn quá 1 điểm %, C4 cùng chiều trên VN-Index. Chuỗi kiểm định: quỹ E1VFVN30, phí 0,2%/chiều, tiền mặt 4%/năm.</p>
              <p>Sổ tiến bóng: {g.ledger.entries} phiên{g.ledger.first ? ` từ ${fmtDate(g.ledger.first)}` : ""}.</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
