// Elite 10 E6 — "Rủi ro danh mục": mô tả rủi ro của danh mục Elite 10 đã khoá (Gateway /api/elite/risk).
// Ledoit–Wolf, đóng góp rủi ro Euler, VaR/CVaR (lịch sử / Gauss / Cornish–Fisher), beta, sụt giảm tối đa, ENB (Meucci), căng thẳng.
import { useMemo } from "react";
import { useEliteRisk } from "../../../hooks/elite10/useEliteCenter";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { divergingColor } from "../../../lib/worldSectors/types";

const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
      <p className="text-[9.5px] font-bold uppercase text-slate-500">{label}</p>
      <p className="font-mono text-[15px] font-bold text-slate-100">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

export default function RiskTab() {
  const { data: r, error, isLoading } = useEliteRisk();
  const { data: ws } = useWorldStrategy();
  const sectorName = useMemo(() => new Map((ws?.short.rows ?? []).map((x) => [x.icb, x.nameVi])), [ws]);
  if (error) return <p className="text-xs text-rose-400">Không tải được rủi ro danh mục: {String(error.message ?? error)}</p>;
  if (isLoading || !r) return <p className="py-6 text-center text-xs italic text-slate-500">Đang tính rủi ro danh mục…</p>;
  if (!r.available) return <p className="tw-scope rounded-lg border border-white/10 p-3 text-[11px] text-slate-400" data-testid="elite-risk-na">{r.reasonVi}</p>;

  const v95 = r.var!["0.95"], v99 = r.var!["0.99"];
  const maxRc = Math.max(...r.holdings!.map((h) => Math.max(h.riskContribution, h.weight)), 0.01);
  const corr = r.correlation!;

  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-risk-tab">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-cyan-300">Rủi ro danh mục Elite 10 — phiên {fmtDate(r.date)}</p>
          <p className="text-[10.5px] text-slate-400">{r.sessions} phiên ({fmtDate(r.from)} → {fmtDate(r.to)}), tỷ trọng cố định như danh mục đã khoá · mô tả rủi ro, không tối ưu lại danh mục.</p>
        </div>
        <span className="rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">{r.label === "EVIDENCE" ? "ĐẠT TIÊU CHÍ" : "THĂM DÒ"}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6" data-testid="elite-risk-tiles">
        <Tile label="Biến động năm" value={pct(r.volatility!.annual, 1)} sub={`ngày ${pct(r.volatility!.daily)}`} />
        <Tile label="VaR 95% · 1 phiên" value={pct(v95.historical.var)} sub={`CVaR ${pct(v95.historical.cvar)} · lịch sử`} />
        <Tile label="VaR 99% · 1 phiên" value={pct(v99.historical.var)} sub={`Cornish–Fisher ${pct(v99.cornishFisher.var)}`} />
        <Tile label="Beta VN-Index" value={num(r.beta)} sub={`tương quan ${num(r.corrWithVnIndex)}`} />
        <Tile label="Sụt giảm tối đa" value={pct(r.maxDrawdown!.value, 1)} sub={`${fmtDate(r.maxDrawdown!.from)} → ${fmtDate(r.maxDrawdown!.to)}`} />
        <Tile label="Số cược hiệu dụng" value={num(r.diversification!.enb, 1)} sub={`DR ${num(r.diversification!.ratio)} · N hiệu dụng ${num(r.diversification!.effectiveN, 1)}`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2" data-testid="elite-risk-rc">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Đóng góp rủi ro so với tỷ trọng</h4>
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {r.holdings!.map((h) => (
                <tr key={h.ticker} className="border-t border-white/5">
                  <td className="py-1 w-14 font-bold text-cyan-300">{h.ticker}</td>
                  <td>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 rounded bg-slate-400/60" style={{ width: `${(h.weight / maxRc) * 140}px` }} /><span className="text-[10px] text-slate-400">tỷ trọng {pct(h.weight, 1)}</span></div>
                      <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 rounded" style={{ width: `${(Math.max(0, h.riskContribution) / maxRc) * 140}px`, background: h.riskContribution > h.weight * 1.25 ? "#f59e0b" : "#38bdf8" }} /><span className="text-[10px] text-slate-300">rủi ro {pct(h.riskContribution, 1)}</span></div>
                    </div>
                  </td>
                  <td className="text-right font-mono text-[10px] text-slate-400">σ năm {pct(h.volAnnual, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500">Đóng góp rủi ro Euler: wᵢ·(Σw)ᵢ / σp, cộng lại đúng 100%. Thanh cam = đóng góp rủi ro vượt 1,25× tỷ trọng.</p>
        </section>

        <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2" data-testid="elite-risk-corr">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Tương quan (sau co rút)</h4>
          <div className="overflow-x-auto">
            <table className="text-[9.5px]" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
              <thead><tr><th />{corr.tickers.map((t) => <th key={t} className="px-1 font-normal text-slate-400">{t}</th>)}</tr></thead>
              <tbody>
                {corr.matrix.map((row, i) => (
                  <tr key={corr.tickers[i]}>
                    <th className="pr-1 text-left font-normal text-slate-400">{corr.tickers[i]}</th>
                    {row.map((c, j) => (
                      <td key={j} title={`${corr.tickers[i]} × ${corr.tickers[j]}: ${num(c)}`} className="h-6 w-8 text-center font-mono text-slate-100"
                        style={{ background: i === j ? "rgba(148,163,184,0.15)" : divergingColor(c == null ? null : (c - r.shrinkage!.avgCorrelation) * 6) }}>
                        {i === j ? "" : num(c, 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">
            {r.shrinkage!.method}: cường độ δ = {num(r.shrinkage!.delta, 2)}, tương quan trung bình {num(r.shrinkage!.avgCorrelation)}. Màu so với mức trung bình (xanh = cao hơn, đỏ = thấp hơn).
          </p>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2" data-testid="elite-risk-stress">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Kiểm tra căng thẳng (lịch sử)</h4>
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="text-slate-500"><th className="text-left font-normal">Kịch bản</th><th className="text-right font-normal">VN-Index</th><th className="text-right font-normal">Danh mục</th></tr></thead>
            <tbody>
              {r.stress!.worstVnIndexDays.map((s) => (
                <tr key={s.date} className="border-t border-white/5"><td className="py-1">Phiên {fmtDate(s.date)}</td><td className="text-right font-mono text-rose-300">{pct(s.vnIndex)}</td><td className="text-right font-mono">{pct(s.portfolio)}</td></tr>
              ))}
              {r.stress!.worst10Sessions && (
                <tr className="border-t border-white/10"><td className="py-1">10 phiên tệ nhất {fmtDate(r.stress!.worst10Sessions.from)} → {fmtDate(r.stress!.worst10Sessions.to)}</td><td className="text-right font-mono text-rose-300">{pct(r.stress!.worst10Sessions.vnIndex)}</td><td className="text-right font-mono">{pct(r.stress!.worst10Sessions.portfolio)}</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2" data-testid="elite-risk-sectors">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Phơi nhiễm ngành & phân phối lợi suất</h4>
          {r.sectors!.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-40 truncate text-slate-300">{sectorName.get(s.key) ?? s.key}</span>
              <span className="inline-block h-1.5 rounded bg-cyan-400/70" style={{ width: `${s.weight * 220}px` }} />
              <span className="font-mono text-slate-400">{pct(s.weight, 1)}</span>
            </div>
          ))}
          <p className="text-[10.5px] text-slate-400">
            Lợi suất ngày: TB {pct(v95.moments.mean, 3)} · độ lệch {num(v95.moments.skew)} · độ nhọn dư {num(v95.moments.exKurt)}. VaR 95% Gauss {pct(v95.gaussian.var)} so với lịch sử {pct(v95.historical.var)}{v95.moments.exKurt > 1 ? " — đuôi dày hơn phân phối chuẩn, ưu tiên số lịch sử / Cornish–Fisher." : "."}
          </p>
          <p className="text-[10px] text-slate-500">{r.var!.tenDayNoteVi}</p>
        </section>
      </div>
      <p className="text-[10px] text-slate-500">Rủi ro quá khứ không bảo đảm rủi ro tương lai. Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
